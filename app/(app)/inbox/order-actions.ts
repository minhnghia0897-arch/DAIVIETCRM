"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { maskPhonesInText } from "@/lib/phone";
import { acceptQuote, CHECKOUT_MESSAGE, placeOrder, sendQuote } from "@/lib/sales/checkout-server";

import type { ActionResult } from "../settings/types";

// Lên đơn, gửi báo giá trong Hội thoại. Trình duyệt chỉ gửi giỏ hàng (SKU, combo, số lượng, giảm tay, phí nhập tay);
// server định giá lại bằng hàm định giá dùng chung với dữ liệu database rồi mới ghi (lib/sales/checkout-server.ts).

const MAX_FEE = 100_000_000;

const schema = z.object({
  leadId: z.uuid(),
  lines: z
    .array(
      z
        .object({
          variantId: z.uuid().optional(),
          comboId: z.uuid().optional(),
          qty: z.number().int().min(1).max(99),
        })
        .refine((l) => Boolean(l.variantId) !== Boolean(l.comboId)),
    )
    .min(1)
    .max(50),
  addressId: z.uuid().nullable(),
  discount: z
    .object({ type: z.enum(["amount", "pct"]), value: z.number().min(0).max(1_000_000_000) })
    .nullable(),
  deliveryFee: z.number().int().min(0).max(MAX_FEE).nullable(),
  installationFee: z.number().int().min(0).max(MAX_FEE).nullable(),
  note: z.string().trim().max(1000).optional(),
  giftMessage: z.string().trim().max(500).optional(),
  /** Kênh bán ghi vào đơn; "showroom" thì áp chính sách kênh showroom, còn lại là online. */
  channel: z.enum(["zalo_oa", "messenger", "showroom", "hotline", "referral"]).optional(),
});

export type CreateOrderInput = z.infer<typeof schema>;

const INVALID = "Dòng hàng, giảm giá hoặc phí chưa đúng, kiểm lại rồi thử lại.";

function toCheckout(d: CreateOrderInput) {
  return {
    leadId: d.leadId,
    cart: {
      lines: d.lines,
      discount: d.discount && d.discount.value > 0 ? d.discount : null,
      deliveryFee: d.deliveryFee,
      installationFee: d.installationFee,
    },
    addressId: d.addressId,
    // Không lưu số điện thoại đầy đủ trong ghi chú, lời nhắn.
    giftMessage: d.giftMessage ? maskPhonesInText(d.giftMessage) : undefined,
    note: d.note ? maskPhonesInText(d.note) : undefined,
  };
}

function refresh() {
  revalidatePath("/inbox");
  revalidatePath("/tasks");
  revalidatePath("/orders");
}

export async function createOrder(input: CreateOrderInput): Promise<ActionResult & { orderId?: string }> {
  const user = await requireUser();
  if (user.viewAs) return { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." };
  if (!user.permissions.has("order.create")) return { ok: false, message: CHECKOUT_MESSAGE.not_allowed };
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, message: INVALID };
  if (p.data.discount?.type === "pct" && p.data.discount.value > 100)
    return { ok: false, message: "Giảm theo phần trăm tối đa 100%." };
  const r = await placeOrder(user, toCheckout(p.data), { channel: p.data.channel });
  if (!r.ok) return { ok: false, message: CHECKOUT_MESSAGE[r.error] };
  refresh();
  return {
    ok: true,
    orderId: r.orderId,
    message:
      r.status === "pending_approval"
        ? `Đã tạo đơn ${r.code}, mức giảm vượt giới hạn nên đang chờ Owner duyệt`
        : `Đã tạo đơn ${r.code}`,
  };
}

export async function createQuote(
  input: CreateOrderInput,
): Promise<ActionResult & { quoteId?: string; code?: string }> {
  const user = await requireUser();
  if (user.viewAs) return { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." };
  if (!user.permissions.has("quote.create")) return { ok: false, message: CHECKOUT_MESSAGE.not_allowed };
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, message: INVALID };
  const r = await sendQuote(user, toCheckout(p.data));
  if (!r.ok) return { ok: false, message: CHECKOUT_MESSAGE[r.error] };
  refresh();
  return {
    ok: true,
    quoteId: r.quoteId,
    code: r.code,
    message: `Đã tạo báo giá ${r.code}, tải hoặc chép ảnh để gửi khách`,
  };
}

/** Nhân viên bấm "Khách đã đồng ý" thay khách. */
export async function acceptQuoteForCustomer(quoteId: string): Promise<ActionResult & { orderId?: string }> {
  const user = await requireUser();
  if (user.viewAs) return { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." };
  // Chỉ người xem được báo giá (RLS theo lead) mới bấm được.
  const { data: q } = await (
    await createClient()
  )
    .from("quotes")
    .select("id")
    .eq("id", z.uuid().parse(quoteId))
    .maybeSingle();
  if (!q) return { ok: false, message: CHECKOUT_MESSAGE.lead_not_found };
  const r = await acceptQuote(quoteId, false);
  if (!r.ok) return { ok: false, message: CHECKOUT_MESSAGE[r.error] };
  refresh();
  return { ok: true, orderId: r.orderId, message: `Khách đã đồng ý, đã tạo đơn ${r.code}` };
}
