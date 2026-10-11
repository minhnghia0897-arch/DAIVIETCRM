"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { maskPhonesInText } from "@/lib/phone";

import type { ActionResult } from "../settings/types";

// Lên đơn trong Hội thoại (migration 20261011000400_sales_orders.sql). Trình duyệt chỉ gửi SKU, số lượng, giảm tay,
// phí giao lắp; giá và tổng tiền do hàm create_order tính lại từ bảng giá (CLAUDE.md 8.1).

const MAX_FEE = 100_000_000;

const orderSchema = z.object({
  leadId: z.uuid(),
  lines: z
    .array(z.object({ variantId: z.uuid(), qty: z.number().int().min(1).max(99) }))
    .min(1)
    .max(50),
  addressId: z.uuid(),
  discount: z
    .object({ type: z.enum(["amount", "pct"]), value: z.number().min(0).max(1_000_000_000) })
    .nullable(),
  deliveryFee: z.number().int().min(0).max(MAX_FEE),
  installationFee: z.number().int().min(0).max(MAX_FEE),
  note: z.string().trim().max(1000).optional(),
  giftMessage: z.string().trim().max(500).optional(),
});

export type CreateOrderInput = z.infer<typeof orderSchema>;

function friendly(code: string | undefined, message: string | undefined): string {
  switch (message) {
    case "missing_required_info":
      return "Lead chưa đủ bốn thông tin bắt buộc (mua cho ai, tỉnh người nhận, dịp, ngân sách). Điền ở thẻ Khách rồi lên đơn.";
    case "address_required":
      return "Chọn địa chỉ giao của người đặt hoặc người nhận.";
    case "lead_lost":
      return "Lead này đã đánh thất bại, không lên đơn được.";
  }
  switch (code) {
    case "42501":
      return "Anh chị chưa được cấp quyền tạo đơn.";
    case "P0002":
      return "Anh chị không còn giữ lead này.";
    case "22023":
      return "Dòng hàng, giảm giá hoặc phí chưa đúng, kiểm lại rồi tạo đơn.";
    default:
      return "Chưa tạo được đơn, thử lại sau ít phút.";
  }
}

export async function createOrder(input: CreateOrderInput): Promise<ActionResult & { orderId?: string }> {
  const user = await requireUser();
  if (user.viewAs) return { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." };
  if (!user.permissions.has("order.create"))
    return { ok: false, message: "Anh chị chưa được cấp quyền tạo đơn." };
  const p = orderSchema.safeParse(input);
  if (!p.success)
    return { ok: false, message: "Dòng hàng, giảm giá hoặc phí chưa đúng, kiểm lại rồi tạo đơn." };
  const d = p.data;
  if (d.discount?.type === "pct" && d.discount.value > 100)
    return { ok: false, message: "Giảm theo phần trăm tối đa 100%." };

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_order", {
    p_lead_id: d.leadId,
    p_lines: d.lines.map((l) => ({ variant_id: l.variantId, qty: l.qty })),
    p_address_id: d.addressId,
    p_discount: d.discount && d.discount.value > 0 ? d.discount : undefined,
    p_delivery_fee: d.deliveryFee,
    p_installation_fee: d.installationFee,
    // Không lưu số điện thoại đầy đủ trong ghi chú đơn.
    p_note: d.note ? maskPhonesInText(d.note) : undefined,
    p_channel: "inbox",
    p_gift_message: d.giftMessage ? maskPhonesInText(d.giftMessage) : undefined,
  });
  if (error || !id) return { ok: false, message: friendly(error?.code, error?.message) };

  const { data: order } = await supabase.from("orders").select("code, status").eq("id", id).maybeSingle();
  revalidatePath("/inbox");
  revalidatePath("/tasks");
  revalidatePath("/orders");
  if (order?.status === "pending_approval")
    return {
      ok: true,
      orderId: id,
      message: `Đã tạo đơn ${order.code}, mức giảm vượt giới hạn nên đang chờ Owner duyệt`,
    };
  return { ok: true, orderId: id, message: `Đã tạo đơn ${order?.code ?? ""}`.trim() };
}
