"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import type { Json } from "@/lib/db/types";
import { buildIngestPayload } from "@/lib/leads/intake";

// Nhập lead nhanh và giao, chuyển lead. Chống trùng, phân vòng tròn, kiểm quyền và nhật ký nằm trong hàm database
// ingest_lead, assign_leads (migration 20261007000700_lead_intake.sql); ở đây chỉ kiểm dữ liệu vào và dịch kết quả.

export type CreateLeadResult =
  { ok: true; message: string; leadId: string; canOpen: boolean } | { ok: false; message: string };

const READ_ONLY = { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." } as const;

const createSchema = z.object({
  fullName: z.string().trim().min(1, "Nhập họ tên khách.").max(200),
  phone: z.string().trim().min(6, "Nhập số điện thoại.").max(40),
  country: z.string().max(16),
  sourceKey: z.string().min(1).max(64),
  productInterest: z.string().max(200).optional(),
  recipientProvince: z.string().max(100).optional(),
  note: z.string().max(2000).optional(),
  marketingConsent: z.boolean().optional(),
});

function hhmm(iso: string, tz: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(
    new Date(iso),
  );
}

export async function createLead(input: z.infer<typeof createSchema>): Promise<CreateLeadResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  if (!user.permissions.has("lead.create"))
    return { ok: false, message: "Anh chị chưa được cấp quyền tạo lead." };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Thiếu thông tin." };

  const supabase = await createClient();
  const { data: markets } = await supabase
    .from("markets")
    .select("country_code, name, timezone")
    .eq("is_active", true);
  const payload = buildIngestPayload(
    parsed.data,
    (markets ?? []).map((m) => m.country_code),
  );
  const { data, error } = await supabase.rpc("ingest_lead", { p: payload as unknown as Json });
  if (error || !data) {
    return {
      ok: false,
      message:
        error?.code === "42501"
          ? "Anh chị chưa được cấp quyền tạo lead."
          : error?.code === "22023"
            ? "Thông tin chưa hợp lệ: kiểm tra nguồn và thị trường."
            : "Chưa lưu được lead, thử lại sau ít phút.",
    };
  }
  const r = data as {
    action: "created" | "new_lead_existing_contact" | "attached";
    lead_id: string;
    route?: "assigned" | "waiting" | "unassigned";
    holder_name?: string | null;
    wait_until?: string | null;
  };
  revalidatePath("/leads");
  revalidatePath("/home");

  // Người tạo chỉ mở được hồ sơ khi họ xem được lead đó (RLS): lead của mình, hoặc có quyền xem mọi lead.
  const { data: visible } = await supabase.from("leads").select("id").eq("id", r.lead_id).maybeSingle();
  const canOpen = Boolean(visible);

  if (r.action === "attached") {
    return {
      ok: true,
      leadId: r.lead_id,
      canOpen,
      message: r.holder_name
        ? `Khách đã có lead đang mở do ${r.holder_name} giữ: đã nối vào lead đó và báo người giữ.`
        : "Khách đã có lead đang mở ở hàng Chưa phân: đã nối vào lead đó.",
    };
  }
  const prefix = r.action === "new_lead_existing_contact" ? "Khách cũ, đã mở lead mới" : "Đã tạo lead";
  const market = (markets ?? []).find((m) => m.country_code === payload.country);
  const tail =
    r.route === "assigned"
      ? `, giao cho ${r.holder_name ?? "người đang trực"}.`
      : r.route === "waiting" && r.wait_until && market
        ? `, chờ khung gọi: gọi lúc ${hhmm(r.wait_until, market.timezone)}${market.country_code === "VN" ? "" : ` giờ ${market.name}`}.`
        : ", đang ở hàng Chưa phân vì chưa có ai nhận lead.";
  return {
    ok: true,
    leadId: r.lead_id,
    canOpen,
    message: `${prefix}${tail}${payload.phone.valid ? "" : " Số chưa hợp lệ: đã gắn cờ để kiểm tra."}`,
  };
}

const assignSchema = z.object({
  leadIds: z.array(z.uuid()).min(1).max(500),
  assigneeId: z.uuid().nullable(),
  assigneeName: z.string().max(200).optional(),
  reason: z.string().max(200).optional(),
});

export async function assignLeads(
  input: z.infer<typeof assignSchema>,
): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  if (!user.permissions.has("lead.assign"))
    return { ok: false, message: "Anh chị chưa được cấp quyền giao lead." };
  const p = assignSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_leads", {
    p_lead_ids: p.leadIds,
    p_assignee: p.assigneeId as string,
    p_reason: p.reason ?? undefined,
  });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "22023"
          ? "Người này không nhận lead được (đã khóa hoặc chưa có quyền xem lead)."
          : error.code === "42501"
            ? "Anh chị chưa được cấp quyền giao lead."
            : "Chưa giao được, thử lại sau ít phút.",
    };
  }
  revalidatePath("/leads");
  revalidatePath("/home");
  const n = data ?? 0;
  if (n === 0) return { ok: true, message: "Không có lead nào cần đổi người giữ." };
  return {
    ok: true,
    message: p.assigneeId
      ? `Đã giao ${n} lead cho ${p.assigneeName ?? "người được chọn"}`
      : `Đã chuyển ${n} lead về hàng Chưa phân`,
  };
}
