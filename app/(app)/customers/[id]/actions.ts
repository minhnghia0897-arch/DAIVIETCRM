"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { CONSENT_CHANNELS, CONSENT_PURPOSES, consentState, stoppedContact } from "@/lib/cdp/lifecycle";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import type { Json } from "@/lib/db/types";

import type { ActionResult } from "../../settings/types";

// Thao tác trên hồ sơ khách 360. Quyền sửa khách, đồng ý, nhật ký đều kiểm ở hàm database (assert_contact_editor,
// set_consent, update_contact_profile, open_customer_lead, export_contact_data: migration 20261012000400).

const READ_ONLY = { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." } as const;

function friendly(code: string | undefined, fallback = "Chưa lưu được, thử lại sau ít phút."): string {
  switch (code) {
    case "42501":
      return "Khách này không thuộc lead anh chị đang giữ, hoặc anh chị chưa được cấp quyền này.";
    case "P0002":
      return "Không còn khách này, hoặc anh chị không xem được khách này.";
    default:
      return fallback;
  }
}

function done(contactId: string, message: string): ActionResult {
  revalidatePath(`/customers/${contactId}`);
  revalidatePath("/customers");
  return { ok: true, message };
}

// ---------------------------------------------------------------------------
// Gọi: số đầy đủ chỉ qua reveal_identity (ghi nhật ký mỗi lần). Người không có contact.phone_reveal chỉ xem được số
// của khách thuộc lead đang giao cho mình (CLAUDE.md mục 5). Giữ bất ngờ và Ngừng liên hệ chặn ở đây, phía server.
// ---------------------------------------------------------------------------

const revealSchema = z.object({ contactId: z.uuid(), identityId: z.uuid() });

export async function revealCustomerPhone(
  input: z.infer<typeof revealSchema>,
): Promise<{ ok: true; phone: string } | { ok: false; message: string }> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  if (!user.permissions.has("call.make")) return { ok: false, message: "Anh chị chưa được cấp quyền gọi." };
  const p = revealSchema.parse(input);
  const supabase = await createClient();

  const [{ data: identity }, { data: consents }] = await Promise.all([
    supabase
      .from("contact_identity_display")
      .select("id")
      .eq("id", p.identityId)
      .eq("contact_id", p.contactId)
      .eq("type", "phone")
      .maybeSingle(),
    supabase
      .from("consents")
      .select("purpose, channel, granted, granted_at, withdrawn_at")
      .eq("contact_id", p.contactId),
  ]);
  if (!identity) return { ok: false, message: friendly("P0002") };
  if (stoppedContact(consents ?? []) || !consentState(consents ?? [], "care", "call").allowed)
    return {
      ok: false,
      message: "Khách đã yêu cầu không gọi. Đổi ở mục Liên hệ và đồng ý khi khách cho phép lại.",
    };

  // Giữ bất ngờ: khách là người nhận của lead hoặc đơn đang mở có cờ thì không hiện số, kể cả với người xem được mọi
  // số (đọc bằng khóa server vì người gọi có thể không xem được lead, đơn của người đặt; chỉ lấy cờ, không lấy số).
  const admin = createAdminClient();
  const [{ count: surpriseLeads }, { count: surpriseOrders }] = await Promise.all([
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("recipient_contact_id", p.contactId)
      .neq("contact_id", p.contactId)
      .eq("keep_surprise", true)
      .is("deleted_at", null)
      .not("stage", "in", "(won,lost)"),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("recipient_contact_id", p.contactId)
      .neq("buyer_contact_id", p.contactId)
      .eq("keep_surprise", true)
      .is("deleted_at", null)
      .not("status", "in", "(completed,cancelled,returned)"),
  ]);
  if (surpriseLeads || surpriseOrders)
    return { ok: false, message: "Người đặt đang giữ bất ngờ: chưa liên hệ người nhận." };

  // Lead đang giao cho người gọi có khách này (người đặt, hoặc người nhận khi không giữ bất ngờ).
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("assigned_to", user.id)
    .not("stage", "in", "(won,lost)")
    .or(`contact_id.eq.${p.contactId},and(recipient_contact_id.eq.${p.contactId},keep_surprise.eq.false)`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase.rpc("reveal_identity", {
    p_identity_id: p.identityId,
    p_lead_id: lead?.id,
  });
  if (error || !data)
    return {
      ok: false,
      message:
        error?.code === "42501"
          ? "Chỉ người đang giữ lead của khách mới xem được số để gọi."
          : "Chưa lấy được số, thử lại sau ít phút.",
    };
  return { ok: true, phone: data };
}

// ---------------------------------------------------------------------------
// Thông tin khách
// ---------------------------------------------------------------------------

const renameSchema = z.object({
  contactId: z.uuid(),
  name: z.string().trim().min(1, "Nhập tên khách.").max(120),
});

export async function renameCustomer(input: z.infer<typeof renameSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Tên chưa hợp lệ." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_contact", {
    p_contact_id: parsed.data.contactId,
    p_name: parsed.data.name,
  });
  if (error) return { ok: false, message: friendly(error.code) };
  return done(parsed.data.contactId, "Đã đổi tên khách");
}

const profileSchema = z.object({
  contactId: z.uuid(),
  country: z.string().regex(/^([A-Z]{2}|unknown)$/),
  province: z.string().trim().max(80),
  relation: z.string().trim().max(60),
});

export async function updateCustomerProfile(input: z.infer<typeof profileSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = profileSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_contact_profile", {
    p_contact: p.contactId,
    p_country: p.country,
    p_province: p.province,
    p_relation: p.relation,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "22023" ? "Thị trường này chưa có trong Cài đặt, Thị trường." : friendly(error.code),
    };
  return done(p.contactId, "Đã lưu thông tin khách");
}

// ---------------------------------------------------------------------------
// Đồng ý theo mục đích và kênh (CLAUDE.md mục 4, consents)
// ---------------------------------------------------------------------------

const consentSchema = z.object({
  contactId: z.uuid(),
  purpose: z.enum(CONSENT_PURPOSES),
  channel: z.enum([...CONSENT_CHANNELS, "all"]),
  granted: z.boolean(),
  source: z.string().trim().max(60).optional(),
});

export async function setCustomerConsent(input: z.infer<typeof consentSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = consentSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_consent", {
    p_contact: p.contactId,
    p_purpose: p.purpose,
    p_channel: p.channel,
    p_granted: p.granted,
    p_source: p.source || (p.granted ? "Khách đồng ý với nhân viên" : "Khách yêu cầu"),
  });
  if (error) return { ok: false, message: friendly(error.code) };
  const stop = p.purpose === "care" && p.channel === "all";
  return done(
    p.contactId,
    stop
      ? p.granted
        ? "Đã ghi nhận khách cho liên hệ lại"
        : "Đã ghi nhận khách yêu cầu ngừng mọi liên hệ"
      : p.granted
        ? "Đã ghi nhận đồng ý"
        : "Đã ghi nhận khách rút đồng ý",
  );
}

// ---------------------------------------------------------------------------
// Ngày quan trọng (nguồn nhắc dịp tặng)
// ---------------------------------------------------------------------------

const dateSchema = z.object({
  contactId: z.uuid(),
  label: z.string().trim().min(1, "Nhập tên ngày, ví dụ Sinh nhật.").max(80),
  date: z.iso.date(),
  yearly: z.boolean(),
});

export async function addCustomerDate(input: z.infer<typeof dateSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const parsed = dateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Ngày chưa hợp lệ." };
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("important_dates").insert({
    showroom_id: user.showroomId,
    contact_id: p.contactId,
    type: p.label,
    date: p.date,
    recurring_yearly: p.yearly,
    source: "staff",
    created_by: user.id,
  });
  if (error) return { ok: false, message: friendly(error.code === "42501" ? "P0002" : error.code) };
  return done(p.contactId, "Đã thêm ngày quan trọng");
}

const removeDateSchema = z.object({ contactId: z.uuid(), id: z.uuid() });

export async function removeCustomerDate(input: z.infer<typeof removeDateSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = removeDateSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("important_dates")
    .delete()
    .eq("id", p.id)
    .eq("contact_id", p.contactId)
    .select("id");
  if (error || !data?.length) return { ok: false, message: friendly(error?.code ?? "P0002") };
  return done(p.contactId, "Đã xóa ngày quan trọng");
}

// ---------------------------------------------------------------------------
// Mở lead mới cho khách cũ (tái bán)
// ---------------------------------------------------------------------------

const leadSchema = z.object({ contactId: z.uuid(), note: z.string().trim().max(2000).optional() });

export async function openCustomerLead(
  input: z.infer<typeof leadSchema>,
): Promise<{ ok: true; message: string; leadId: string; canOpen: boolean } | { ok: false; message: string }> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  if (!user.permissions.has("lead.create"))
    return { ok: false, message: "Anh chị chưa được cấp quyền tạo lead." };
  const p = leadSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_customer_lead", {
    p_contact: p.contactId,
    p_note: p.note || undefined,
  });
  if (error || !data)
    return {
      ok: false,
      message:
        error?.code === "22023"
          ? "Khách đã yêu cầu ngừng liên hệ, chưa mở lead được."
          : friendly(error?.code),
    };
  const r = data as {
    action: "created" | "exists";
    lead_id: string;
    route?: string;
    holder_name?: string | null;
  };
  const { data: visible } = await supabase.from("leads").select("id").eq("id", r.lead_id).maybeSingle();
  revalidatePath("/leads");
  const message =
    r.action === "exists"
      ? "Khách đang có lead mở, dùng lead đó thay vì mở lead mới."
      : r.route === "assigned"
        ? `Đã mở lead mới, giao cho ${r.holder_name ?? "người đang trực"}.`
        : r.route === "waiting"
          ? "Đã mở lead mới, chờ khung gọi của thị trường khách."
          : "Đã mở lead mới, đang ở hàng Chưa phân.";
  done(p.contactId, message);
  return { ok: true, message, leadId: r.lead_id, canOpen: Boolean(visible) };
}

// ---------------------------------------------------------------------------
// Trích xuất dữ liệu một khách theo yêu cầu của khách (CLAUDE.md 11.2, 12)
// ---------------------------------------------------------------------------

export async function exportCustomerData(input: {
  contactId: string;
}): Promise<{ ok: true; data: Json } | { ok: false; message: string }> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  if (!user.permissions.has("lead.export"))
    return { ok: false, message: "Anh chị chưa được cấp quyền xuất dữ liệu khách." };
  const { contactId } = z.object({ contactId: z.uuid() }).parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_contact_data", { p_contact: contactId });
  if (error || !data)
    return { ok: false, message: friendly(error?.code, "Chưa xuất được, thử lại sau ít phút.") };
  return { ok: true, data };
}
