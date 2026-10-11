import type { Discount, PricingCatalog, QuoteInput, QuoteResult } from "./pricing";

// Giỏ hàng của màn Lên đơn → đầu vào hàm định giá → dữ liệu ghi đơn, báo giá. Hàm thuần, dùng chung trình duyệt (xem
// trước) và server (tính lại rồi mới ghi, CLAUDE.md 8.1).

export interface Cart {
  lines: { variantId?: string; comboId?: string; qty: number }[];
  /** Giảm tay của người bán cho cả đơn. */
  discount: { type: "amount" | "pct"; value: number } | null;
  /** Phí nhân viên nhập; null là để chính sách giao lắp tính (hoặc 0 khi chưa có chính sách). */
  deliveryFee: number | null;
  installationFee: number | null;
}

export interface CartContext {
  showroomId: string;
  channel: string;
  buyerCountry: string;
  customerTags: string[];
  recipientProvince?: string;
  date: Date;
  sellerId: string;
  sellerRole: string;
}

/** Chia `amount` theo tỷ lệ `weights`, phần dư dồn vào phần cuối có trọng số. */
function allocate(amount: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const out = weights.map((w) => Math.floor((amount * w) / sum));
  const last = weights
    .map((w, i) => (w > 0 ? i : -1))
    .filter((i) => i >= 0)
    .at(-1)!;
  out[last] += amount - out.reduce((a, b) => a + b, 0);
  return out;
}

/** Giá lẻ ước tính của một dòng giỏ (để chia giảm tay theo số tiền). */
function retail(l: Cart["lines"][number], catalog: PricingCatalog): number {
  if (l.variantId) return (catalog.variants[l.variantId]?.price ?? 0) * l.qty;
  const c = l.comboId ? catalog.combos[l.comboId] : undefined;
  if (!c) return 0;
  const sum = c.items.reduce(
    (s, it) => s + (it.isGift ? 0 : (catalog.variants[it.variantId]?.price ?? 0) * it.qty),
    0,
  );
  return (c.pricingMode === "fixed_price" ? (c.price ?? sum) : Math.max(0, sum - (c.discount ?? 0))) * l.qty;
}

export function toQuoteInput(cart: Cart, ctx: CartContext, catalog: PricingCatalog): QuoteInput {
  const lines = cart.lines.filter((l) => l.qty > 0);
  let manual: (Discount | undefined)[] = lines.map(() => undefined);
  if (cart.discount && cart.discount.value > 0) {
    if (cart.discount.type === "pct") {
      manual = lines.map(() => ({ kind: "percent", value: Math.min(100, cart.discount!.value) }));
    } else {
      manual = allocate(
        Math.round(cart.discount.value),
        lines.map((l) => retail(l, catalog)),
      ).map((v) => (v > 0 ? { kind: "amount", value: v } : undefined));
    }
  }
  return {
    lines: lines.map((l, i) => ({
      ...(l.comboId ? { comboId: l.comboId } : { variantId: l.variantId }),
      qty: l.qty,
      ...(manual[i] ? { manualDiscount: manual[i] } : {}),
    })),
    feeOverride: {
      ...(cart.deliveryFee !== null ? { delivery: cart.deliveryFee } : {}),
      ...(cart.installationFee !== null ? { installation: cart.installationFee } : {}),
    },
    context: ctx,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kết quả định giá → dữ liệu cho persist_priced_order, persist_quote (cột tiền khớp check_priced). */
export function toPersistPayload(r: QuoteResult) {
  return {
    lines: r.lines.map((l) => ({
      variant_id: l.variantId,
      combo_id: l.comboId ?? null,
      name: l.name,
      qty: l.qty,
      unit_price: l.unitPrice,
      discount: l.discount,
      total: l.total,
      is_gift: l.isGift,
    })),
    subtotal: r.totals.subtotal,
    discount: r.totals.discount,
    delivery_fee: r.fees.delivery,
    installation_fee: r.fees.installation,
    total: r.totals.total,
    deposit_min: r.deposit.minimum,
    // Chính sách mặc định sinh từ Cài đặt (không phải dòng chính sách thật) không ghi vào đơn.
    applied: r.appliedPolicies.filter((a) => UUID.test(a.id)),
    approvals: r.approvalsNeeded.map((a) => a.reason),
  };
}
