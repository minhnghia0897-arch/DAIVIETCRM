"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { maskPhonesInText } from "@/lib/phone";

import type { ActionResult } from "../settings/types";

// Thao tác trên hồ sơ đơn (migration 20261011000500_sales_flow.sql; không quản lý kho từ 20261018000100). Mọi điều
// kiện (đủ cọc, quyền, người ghi tiền không tự xác nhận) kiểm ở database; ở đây chỉ kiểm dữ liệu vào và dịch lỗi ra
// câu dễ hiểu.

const READ_ONLY = { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." } as const;

const MESSAGES: Record<string, string> = {
  no_next_status: "Đơn đã ở bước cuối.",
  cannot_cancel: "Đơn đã hoàn tất hoặc đã hủy nên không hủy được.",
  cod_locked: "Chỉ duyệt thu khi giao trước khi đơn sẵn sàng giao.",
  cannot_self_approve: "Anh chị không tự duyệt được cho đơn mình bán.",
  delivery_locked: "Đơn đã kết thúc, không cập nhật giao lắp được.",
  handover_too_early: "Gửi video bàn giao sau khi đã lắp.",
  payment_locked: "Đơn ở trạng thái này chưa ghi nhận tiền được.",
  invalid_amount: "Số tiền phải lớn hơn 0 và không quá số còn phải thu.",
  refund_locked: "Chỉ ghi hoàn tiền cho đơn đã hủy hoặc đã trả hàng.",
};

function friendly(code: string | undefined, message: string | undefined): string {
  const key = (message ?? "").split(":")[0].trim();
  if (MESSAGES[key]) return MESSAGES[key];
  if (key === "blocked") return `Chưa chuyển được: ${(message ?? "").slice(9)}`;
  switch (code) {
    case "42501":
      return "Anh chị chưa được cấp quyền làm việc này.";
    case "P0002":
      return "Không còn đơn này, hoặc anh chị không còn quyền xem.";
    case "22023":
      return "Dữ liệu chưa đúng, kiểm lại rồi lưu.";
    default:
      return "Chưa lưu được, thử lại sau ít phút.";
  }
}

function done(orderId: string, message: string): ActionResult {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { ok: true, message };
}

const id = z.uuid();

const NEXT_LABEL: Record<string, string> = {
  confirmed: "đã xác nhận",
  deposit_paid: "đã cọc",
  ready_to_ship: "sẵn sàng giao",
  delivering: "đang giao",
  installed: "đã lắp",
  completed: "hoàn tất, đã sinh phiếu bảo hành",
};

export async function advanceOrder(orderId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("advance_order", { p_order_id: id.parse(orderId) });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done(orderId, `Đơn ${NEXT_LABEL[data as string] ?? "đã chuyển bước"}`);
}

export async function cancelOrder(input: { orderId: string; reason: string }): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = z.object({ orderId: id, reason: z.string().trim().min(1).max(500) }).safeParse(input);
  if (!p.success) return { ok: false, message: "Nhập lý do hủy." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: p.data.orderId,
    p_reason: maskPhonesInText(p.data.reason),
  });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done(p.data.orderId, "Đã hủy đơn");
}

export async function approveCod(orderId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_cod", { p_order_id: id.parse(orderId) });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done(orderId, "Đã duyệt thu phần còn lại khi giao");
}

export async function updateDelivery(input: {
  orderId: string;
  scheduledOn: string | null;
  note: string;
  handover?: boolean;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = z
    .object({
      orderId: id,
      scheduledOn: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
      note: z.string().trim().max(500),
      handover: z.boolean().optional(),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, message: "Ngày hẹn hoặc ghi chú chưa đúng." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_delivery", {
    p_order_id: p.data.orderId,
    p_scheduled_on: p.data.scheduledOn as string,
    p_note: maskPhonesInText(p.data.note),
    p_handover: p.data.handover ?? false,
  });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done(p.data.orderId, p.data.handover ? "Đã ghi gửi video bàn giao" : "Đã lưu lịch giao");
}

const PROOF_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/** Ghi nhận khoản khách trả, kèm ảnh chứng từ (tùy chọn). Người có payment.confirm xác nhận ở Việc cần làm. */
export async function recordPayment(form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = z
    .object({
      orderId: id,
      method: z.enum(["bank_transfer", "cash", "cod"]),
      amount: z.coerce.number().int().positive().max(100_000_000_000),
      reference: z.string().trim().max(200),
    })
    .safeParse({
      orderId: form.get("orderId"),
      method: form.get("method"),
      amount: String(form.get("amount") ?? "").replace(/[^\d]/g, ""),
      reference: form.get("reference") ?? "",
    });
  if (!p.success) return { ok: false, message: MESSAGES.invalid_amount };
  const file = form.get("proof");

  const supabase = await createClient();
  // Chỉ người xem được đơn mới tải chứng từ lên (RLS trên orders).
  const { data: order } = await supabase
    .from("orders")
    .select("id, showroom_id")
    .eq("id", p.data.orderId)
    .maybeSingle();
  if (!order) return { ok: false, message: friendly("P0002", undefined) };

  let proofPath: string | undefined;
  if (file instanceof File && file.size > 0) {
    const ext = PROOF_TYPES[file.type];
    if (!ext) return { ok: false, message: "Chứng từ chỉ nhận ảnh JPG, PNG, WEBP, HEIC hoặc PDF." };
    if (file.size > 10 * 1024 * 1024) return { ok: false, message: "Chứng từ tối đa 10MB." };
    proofPath = `${order.showroom_id}/${order.id}/${randomUUID()}.${ext}`;
    const admin = createAdminClient();
    const { error: upErr } = await admin.storage
      .from("payment-proofs")
      .upload(proofPath, file, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, message: "Chưa tải được chứng từ lên, thử lại sau ít phút." };
  }

  const { error } = await supabase.rpc("record_payment", {
    p_order_id: p.data.orderId,
    p_method: p.data.method,
    p_amount: p.data.amount,
    p_reference: p.data.reference,
    p_proof_path: proofPath,
  });
  if (error) {
    if (proofPath) await createAdminClient().storage.from("payment-proofs").remove([proofPath]);
    return { ok: false, message: friendly(error.code, error.message) };
  }
  revalidatePath("/tasks");
  return done(p.data.orderId, "Đã ghi nhận, chờ người có quyền xác nhận tiền về");
}

export async function recordRefund(input: {
  orderId: string;
  amount: number;
  reference: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = z
    .object({
      orderId: id,
      amount: z.number().int().positive(),
      reference: z.string().trim().max(200),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, message: MESSAGES.invalid_amount };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_refund", {
    p_order_id: p.data.orderId,
    p_amount: p.data.amount,
    p_reference: p.data.reference,
  });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  return done(p.data.orderId, "Đã ghi hoàn tiền");
}
