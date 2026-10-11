"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { maskPhonesInText } from "@/lib/phone";

import type { ActionResult } from "../../settings/types";

// Mọi lệnh ghi trên hồ sơ lead đi qua hàm database (migration 20261007000600_lat0_work.sql) hoặc UPDATE có RLS và
// trigger guard_lead_update: quyền sửa, chặn sang Demo khi thiếu thông tin, nhật ký đều kiểm ở database.

const READ_ONLY = { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." } as const;

/** Đổi lỗi database sang câu tiếng Việt cho người dùng; không đưa nguyên văn lỗi ra màn hình. */
function friendly(code: string | undefined, fallback = "Chưa lưu được, thử lại sau ít phút."): string {
  switch (code) {
    case "42501":
      return "Lead này không do anh chị giữ, hoặc anh chị chưa được cấp quyền này.";
    case "P0002":
      return "Không còn lead này.";
    case "23514":
      return "Thiếu thông tin bắt buộc: mua cho ai, tỉnh người nhận, dịp, ngân sách.";
    default:
      return fallback;
  }
}

function done(leadId: string, message: string): ActionResult {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/tasks");
  return { ok: true, message };
}

// ---------------------------------------------------------------------------
// Gọi: server trả số đầy đủ của đúng lead đang giao cho người gọi, có ghi nhật ký (CLAUDE.md mục 5)
// ---------------------------------------------------------------------------

const revealSchema = z.object({ leadId: z.uuid(), identityId: z.uuid() });

export async function revealPhone(
  input: z.infer<typeof revealSchema>,
): Promise<{ ok: true; phone: string } | { ok: false; message: string }> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  if (!user.permissions.has("call.make")) return { ok: false, message: "Anh chị chưa được cấp quyền gọi." };
  const p = revealSchema.parse(input);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reveal_identity", {
    p_identity_id: p.identityId,
    p_lead_id: p.leadId,
  });
  if (error || !data)
    return {
      ok: false,
      message:
        error?.code === "42501"
          ? "Chỉ người đang giữ lead mới xem được số để gọi."
          : "Chưa lấy được số, thử lại sau ít phút.",
    };
  return { ok: true, phone: data };
}

// ---------------------------------------------------------------------------
// Ghi kết quả cuộc gọi
// ---------------------------------------------------------------------------

const callSchema = z.object({
  leadId: z.uuid(),
  channel: z.enum(["phone", "zalo"]),
  outcomeKey: z.string().min(1).max(64),
  note: z.string().max(2000).optional(),
  callbackAt: z.iso.datetime().optional(),
});

export async function logCall(input: z.infer<typeof callSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = callSchema.parse(input);

  const supabase = await createClient();
  const { error } = await supabase.rpc("log_call", {
    p_lead_id: p.leadId,
    p_channel: p.channel,
    p_outcome_key: p.outcomeKey,
    // Dòng sự kiện không giữ số điện thoại đầy đủ (CLAUDE.md mục 4, events).
    p_note: p.note ? maskPhonesInText(p.note.trim()) : undefined,
    p_callback_at: p.callbackAt,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "22023" && error.message.includes("future")
          ? "Giờ hẹn gọi lại đã qua, chọn giờ khác."
          : friendly(error.code),
    };
  return done(p.leadId, p.callbackAt ? "Đã ghi kết quả và hẹn gọi lại" : "Đã ghi kết quả cuộc gọi");
}

// ---------------------------------------------------------------------------
// Ghi chú
// ---------------------------------------------------------------------------

const noteSchema = z.object({ leadId: z.uuid(), text: z.string().trim().min(1).max(4000) });

export async function addNote(input: z.infer<typeof noteSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = noteSchema.parse(input);

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_lead_note", {
    p_lead_id: p.leadId,
    p_text: maskPhonesInText(p.text),
  });
  if (error) return { ok: false, message: friendly(error.code) };
  return done(p.leadId, "Đã thêm ghi chú");
}

// ---------------------------------------------------------------------------
// Bốn thông tin bắt buộc và cờ Giữ bất ngờ
// ---------------------------------------------------------------------------

const infoSchema = z.object({
  leadId: z.uuid(),
  recipientProvince: z.string().max(80).nullable().optional(),
  occasionId: z.uuid().nullable().optional(),
  occasionDate: z.iso.date().nullable().optional(),
  budgetRangeId: z.uuid().nullable().optional(),
  keepSurprise: z.boolean().optional(),
});

export async function updateLeadInfo(input: z.infer<typeof infoSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const { leadId, ...p } = infoSchema.parse(input);

  const patch: {
    recipient_province?: string | null;
    occasion_id?: string | null;
    occasion_date?: string | null;
    budget_range_id?: string | null;
    keep_surprise?: boolean;
  } = {};
  if (p.recipientProvince !== undefined) patch.recipient_province = p.recipientProvince?.trim() || null;
  if (p.occasionId !== undefined) patch.occasion_id = p.occasionId;
  if (p.occasionDate !== undefined) patch.occasion_date = p.occasionDate;
  if (p.budgetRangeId !== undefined) patch.budget_range_id = p.budgetRangeId;
  if (p.keepSurprise !== undefined) patch.keep_surprise = p.keepSurprise;
  if (!Object.keys(patch).length) return { ok: true, message: "Không có gì thay đổi" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").update(patch).eq("id", leadId).select("id");
  if (error) return { ok: false, message: friendly(error.code) };
  if (!data?.length) return { ok: false, message: friendly("42501") };
  return done(leadId, "Đã lưu");
}

const marketSchema = z.object({
  leadId: z.uuid(),
  contactId: z.uuid(),
  country: z.string().regex(/^([A-Z]{2}|unknown)$/),
});

/** Thị trường người đặt do nhân viên xác nhận khi gọi (CLAUDE.md mục 6). */
export async function setBuyerMarket(input: z.infer<typeof marketSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = marketSchema.parse(input);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({ country_of_residence: p.country })
    .eq("id", p.contactId)
    .select("id");
  if (error) return { ok: false, message: friendly(error.code) };
  if (!data?.length) return { ok: false, message: friendly("42501") };
  return done(p.leadId, "Đã lưu thị trường người đặt");
}

const recipientSchema = z.object({
  leadId: z.uuid(),
  self: z.boolean(),
  name: z.string().trim().max(120).optional(),
  relation: z.string().trim().max(40).optional(),
});

export async function setRecipient(input: z.infer<typeof recipientSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = recipientSchema.parse(input);
  if (!p.self && !p.name) return { ok: false, message: "Nhập tên người nhận." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_lead_recipient", {
    p_lead_id: p.leadId,
    p_self: p.self,
    p_name: p.name,
    p_relation: p.relation,
  });
  if (error) return { ok: false, message: friendly(error.code) };
  return done(p.leadId, p.self ? "Đã ghi: mua cho chính mình" : "Đã lưu người nhận");
}

// ---------------------------------------------------------------------------
// Giai đoạn: Đã liên hệ → Demo bằng tay; thất bại cần lý do. Từ báo giá trở đi chỉ sinh từ báo giá và đơn.
// ---------------------------------------------------------------------------

const leadOnly = z.object({ leadId: z.uuid() });

export async function moveToDemo(input: z.infer<typeof leadOnly>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = leadOnly.parse(input);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ stage: "demo" })
    .eq("id", p.leadId)
    .in("stage", ["new", "contacted"])
    .select("id");
  if (error) return { ok: false, message: friendly(error.code) };
  if (!data?.length) return { ok: false, message: "Lead không còn ở giai đoạn chuyển sang Demo được." };
  return done(p.leadId, "Đã chuyển sang Demo");
}

const lostSchema = z.object({ leadId: z.uuid(), reasonKey: z.string().min(1).max(64) });

export async function markLost(input: z.infer<typeof lostSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = lostSchema.parse(input);

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_lead_lost", { p_lead_id: p.leadId, p_reason_key: p.reasonKey });
  if (error)
    return {
      ok: false,
      message: error.code === "22023" ? "Lead đã đóng hoặc lý do không còn dùng." : friendly(error.code),
    };
  return done(p.leadId, "Đã đánh thất bại. Việc đã lên lịch được hủy kèm lý do");
}

// ---------------------------------------------------------------------------
// Ngày quan trọng nghe được trong cuộc gọi (sinh nhật bố, mừng thọ mẹ)
// ---------------------------------------------------------------------------

const dateSchema = z.object({
  leadId: z.uuid(),
  contactId: z.uuid(),
  label: z.string().trim().min(1).max(80),
  date: z.iso.date(),
});

export async function addImportantDate(input: z.infer<typeof dateSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = dateSchema.parse(input);

  const supabase = await createClient();
  const { error } = await supabase.from("important_dates").insert({
    showroom_id: user.showroomId,
    contact_id: p.contactId,
    type: p.label,
    date: p.date,
    source: "call",
    created_by: user.id,
  });
  if (error) return { ok: false, message: friendly(error.code) };
  return done(p.leadId, "Đã thêm ngày quan trọng");
}
