import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

// Hàm định giá duy nhất (CLAUDE.md 8.5) dùng cho báo giá, đơn hàng và màn hình Thử chính sách.
// Hàm thuần: không đọc giờ máy, không truy vấn; giá, combo, chính sách được nạp trước rồi truyền vào.
// Tiền là số nguyên đơn vị đồng.

export type Discount = { kind: "percent"; value: number } | { kind: "amount"; value: number };

export interface PricingVariant {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  deliveryClass: "parcel" | "bulky";
}

export interface PricingCombo {
  id: string;
  name: string;
  pricingMode: "fixed_price" | "sum_minus";
  /** Giá trọn gói khi `fixed_price`. */
  price?: number;
  /** Khoản trừ khỏi tổng giá lẻ khi `sum_minus`. */
  discount?: number;
  items: { variantId: string; qty: number; isGift?: boolean }[];
  validFrom?: string;
  validTo?: string | null;
}

export interface PromotionRules {
  scope?: { variantIds?: string[]; categoryIds?: string[]; comboIds?: string[] };
  minSubtotal?: number;
  buyerCountries?: string[];
  customerTags?: string[];
  benefit: {
    percentOff?: number;
    amountOff?: number;
    giftVariantIds?: string[];
    freeInstallation?: boolean;
    freeDelivery?: boolean;
  };
}

export interface DeliveryZone {
  label: string;
  /** Danh sách tỉnh, hoặc "*" cho mọi tỉnh còn lại. */
  provinces: string[] | "*";
  fee: number;
  installation: { bulky: number; parcel: number };
  leadDays: number;
  cutoff?: { date: string; label: string };
}

export interface DeliveryRules {
  zones: DeliveryZone[];
}

export interface DepositRules {
  minAmount: number;
  minPercent: number;
  holdDays: number;
}

export interface DiscountLimitRules {
  /** Mức giảm tay tối đa (% trên giá lẻ) theo khóa vai trò. Vai trò không có trong bảng thì là 0. */
  byRole: Record<string, number>;
}

interface PolicyBase {
  id: string;
  version: number;
  name: string;
  status: "draft" | "active" | "paused" | "expired";
  validFrom: string;
  validTo: string | null;
  channels: string[] | null;
  priority: number;
  stackable: boolean;
}

export type Policy = PolicyBase &
  (
    | { type: "promotion"; rules: PromotionRules }
    | { type: "delivery"; rules: DeliveryRules }
    | { type: "deposit"; rules: DepositRules }
    | { type: "discount_limit"; rules: DiscountLimitRules }
  );

export interface PricingCatalog {
  variants: Record<string, PricingVariant>;
  combos: Record<string, PricingCombo>;
  policies: Policy[];
  /** Tồn khả dụng theo SKU, để cảnh báo thiếu hàng. Bỏ trống thì không kiểm. */
  available?: Record<string, number>;
}

export interface QuoteInput {
  lines: { variantId?: string; comboId?: string; qty: number; manualDiscount?: Discount }[];
  context: {
    showroomId: string;
    channel: string;
    buyerCountry: string;
    customerTags: string[];
    recipientProvince?: string;
    date: Date;
    sellerId: string;
    sellerRole: string;
  };
}

export interface PricedLine {
  variantId: string;
  name: string;
  comboId?: string;
  qty: number;
  unitPrice: number;
  listPrice: number;
  discount: number;
  total: number;
  isGift: boolean;
  policyIds: string[];
}

export interface AppliedPolicy {
  id: string;
  version: number;
  type: Policy["type"];
  name: string;
  benefit: string;
}

export interface QuoteResult {
  lines: PricedLine[];
  appliedPolicies: AppliedPolicy[];
  fees: { delivery: number; installation: number };
  totals: { subtotal: number; discount: number; fees: number; total: number };
  deposit: { minimum: number; holdDays: number };
  approvalsNeeded: { reason: string; policyId?: string }[];
  warnings: string[];
}

const TZ = "Asia/Ho_Chi_Minh";
/** Làm tròn khoản giảm theo nghìn đồng. */
const round1k = (v: number) => Math.round(v / 1000) * 1000;
const vnd = (v: number) => `${new Intl.NumberFormat("vi-VN").format(v)}đ`;

export function vnDay(date: Date): string {
  return format(new TZDate(date, TZ), "yyyy-MM-dd");
}

function isActive(
  p: { status: string; validFrom: string; validTo: string | null; channels: string[] | null },
  day: string,
  channel: string,
) {
  if (p.status !== "active") return false;
  if (day < p.validFrom) return false;
  if (p.validTo && day > p.validTo) return false;
  if (p.channels && !p.channels.includes(channel)) return false;
  return true;
}

/** Chia `amount` cho các phần theo tỷ lệ `weights`, phần dư dồn vào phần cuối có trọng số. */
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

export function priceQuote(input: QuoteInput, catalog: PricingCatalog): QuoteResult {
  const { context } = input;
  const day = vnDay(context.date);
  const warnings: string[] = [];
  const approvalsNeeded: QuoteResult["approvalsNeeded"] = [];
  const applied: AppliedPolicy[] = [];

  // 1. Tách dòng; combo được tách thành các dòng thành phần, giá combo phân bổ theo tỷ lệ giá lẻ.
  type Work = PricedLine & { manual?: Discount; categoryId: string };
  const lines: Work[] = [];
  for (const l of input.lines) {
    if (l.qty <= 0 || !Number.isInteger(l.qty)) {
      warnings.push("Số lượng phải là số nguyên dương");
      continue;
    }
    if (l.variantId) {
      const v = catalog.variants[l.variantId];
      if (!v) {
        warnings.push(`Không tìm thấy SKU ${l.variantId}`);
        continue;
      }
      lines.push({
        variantId: v.id,
        name: v.name,
        qty: l.qty,
        unitPrice: v.price,
        listPrice: v.price * l.qty,
        discount: 0,
        total: v.price * l.qty,
        isGift: false,
        policyIds: [],
        manual: l.manualDiscount,
        categoryId: v.categoryId,
      });
    } else if (l.comboId) {
      const c = catalog.combos[l.comboId];
      if (!c) {
        warnings.push(`Không tìm thấy combo ${l.comboId}`);
        continue;
      }
      if ((c.validFrom && day < c.validFrom) || (c.validTo && day > c.validTo)) {
        warnings.push(`Combo ${c.name} không còn hiệu lực`);
        continue;
      }
      const parts = c.items.map((it) => {
        const v = catalog.variants[it.variantId];
        return { it, v, retail: it.isGift || !v ? 0 : v.price * it.qty * l.qty };
      });
      if (parts.some((p) => !p.v)) {
        warnings.push(`Combo ${c.name} có SKU không tồn tại`);
        continue;
      }
      const retail = parts.reduce((s, p) => s + p.retail, 0);
      const comboTotal =
        c.pricingMode === "fixed_price"
          ? (c.price ?? retail) * l.qty
          : Math.max(0, retail - (c.discount ?? 0) * l.qty);
      const shares = allocate(
        comboTotal,
        parts.map((p) => p.retail),
      );
      // Giảm tay trên combo áp cho mọi món bán của combo (không áp vào quà): phần trăm giữ nguyên từng dòng,
      // số tiền chia theo giá trị từng dòng, để doanh thu theo SKU và tỷ lệ giảm so với giới hạn đều đúng.
      const m = l.manualDiscount;
      const amountShares =
        m?.kind === "amount"
          ? allocate(
              m.value,
              parts.map((p, i) => (p.it.isGift ? 0 : shares[i])),
            )
          : [];
      parts.forEach((p, i) => {
        const qty = p.it.qty * l.qty;
        lines.push({
          variantId: p.v!.id,
          name: p.v!.name,
          comboId: c.id,
          qty,
          unitPrice: p.it.isGift ? 0 : p.v!.price,
          listPrice: p.retail,
          discount: p.retail - shares[i],
          total: shares[i],
          isGift: Boolean(p.it.isGift),
          policyIds: [],
          manual:
            !m || p.it.isGift
              ? undefined
              : m.kind === "amount"
                ? { kind: "amount", value: amountShares[i] }
                : m,
          categoryId: p.v!.categoryId,
        });
      });
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.listPrice, 0);
  const active = catalog.policies.filter((p) => isActive(p, day, context.channel));

  // 2. Khuyến mãi theo độ ưu tiên; chính sách không cộng dồn loại các chính sách thấp hơn cùng phạm vi.
  let freeInstallation = false;
  let freeDelivery = false;
  const blocked = new Set<number>(); // chỉ số dòng đã bị một khuyến mãi không cộng dồn giữ
  const promos = active
    .filter((p): p is Extract<Policy, { type: "promotion" }> => p.type === "promotion")
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const p of promos) {
    const r = p.rules;
    if (r.buyerCountries && !r.buyerCountries.includes(context.buyerCountry)) continue;
    if (r.customerTags && !r.customerTags.some((t) => context.customerTags.includes(t))) continue;
    if (r.minSubtotal && subtotal < r.minSubtotal) continue;
    const scoped = lines
      .map((l, i) => ({ l, i }))
      .filter(
        ({ l }) =>
          !l.isGift &&
          (!r.scope ||
            r.scope.variantIds?.includes(l.variantId) ||
            r.scope.categoryIds?.includes(l.categoryId) ||
            (l.comboId !== undefined && r.scope.comboIds?.includes(l.comboId))),
      );
    if (!scoped.length) continue;
    if (scoped.some(({ i }) => blocked.has(i))) continue;

    const parts: string[] = [];
    if (r.benefit.percentOff) {
      for (const { l } of scoped) {
        const d = round1k((l.total * r.benefit.percentOff) / 100);
        l.discount += d;
        l.total -= d;
        l.policyIds.push(p.id);
      }
      parts.push(`giảm ${r.benefit.percentOff}%`);
    }
    if (r.benefit.amountOff) {
      const base = scoped.map(({ l }) => l.total);
      const amount = Math.min(
        r.benefit.amountOff,
        base.reduce((a, b) => a + b, 0),
      );
      allocate(amount, base).forEach((d, k) => {
        scoped[k].l.discount += d;
        scoped[k].l.total -= d;
        scoped[k].l.policyIds.push(p.id);
      });
      parts.push(`giảm ${vnd(amount)}`);
    }
    for (const gid of r.benefit.giftVariantIds ?? []) {
      const g = catalog.variants[gid];
      if (!g) continue;
      lines.push({
        variantId: g.id,
        name: g.name,
        qty: 1,
        unitPrice: 0,
        listPrice: 0,
        discount: 0,
        total: 0,
        isGift: true,
        policyIds: [p.id],
        categoryId: g.categoryId,
      });
      parts.push(`tặng ${g.name}`);
    }
    if (r.benefit.freeInstallation) {
      freeInstallation = true;
      parts.push("miễn phí lắp");
    }
    if (r.benefit.freeDelivery) {
      freeDelivery = true;
      parts.push("miễn phí giao");
    }
    if (!p.stackable) scoped.forEach(({ i }) => blocked.add(i));
    applied.push({ id: p.id, version: p.version, type: p.type, name: p.name, benefit: parts.join(", ") });
  }

  // 3. Giảm tay của người bán áp sau cùng, kiểm giới hạn theo vai trò.
  let manualTotal = 0;
  let manualBase = 0;
  for (const l of lines) {
    if (!l.manual || l.isGift) continue;
    manualBase += l.total;
    const d = Math.min(
      l.total,
      l.manual.kind === "percent" ? round1k((l.total * l.manual.value) / 100) : Math.round(l.manual.value),
    );
    l.discount += d;
    l.total -= d;
    manualTotal += d;
  }
  if (manualTotal > 0) {
    const limit = active.find(
      (p): p is Extract<Policy, { type: "discount_limit" }> => p.type === "discount_limit",
    );
    const max = limit?.rules.byRole[context.sellerRole] ?? 0;
    // Tỷ lệ tính trên số tiền mà khoản giảm tay áp vào (sau khuyến mãi), đúng con số người bán nhập.
    const pct = manualBase ? (manualTotal / manualBase) * 100 : 0;
    if (pct > max + 1e-9) {
      approvalsNeeded.push({
        reason: `Giảm tay ${pct.toFixed(1).replace(".", ",")}% vượt giới hạn ${max}% của vai trò`,
        policyId: limit?.id,
      });
    }
  }

  // 4. Phí giao, lắp theo vùng của tỉnh người nhận.
  let delivery = 0;
  let installation = 0;
  const deliveryPolicy = active
    .filter((p): p is Extract<Policy, { type: "delivery" }> => p.type === "delivery")
    .sort((a, b) => b.priority - a.priority)[0];
  if (lines.length && deliveryPolicy) {
    if (!context.recipientProvince) {
      warnings.push("Chưa có tỉnh người nhận, chưa tính phí giao lắp");
    } else {
      const zones = deliveryPolicy.rules.zones;
      const zone =
        zones.find((z) => z.provinces !== "*" && z.provinces.includes(context.recipientProvince!)) ??
        zones.find((z) => z.provinces === "*");
      if (!zone) {
        warnings.push(`Chưa có vùng giao cho ${context.recipientProvince}`);
      } else {
        delivery = freeDelivery ? 0 : zone.fee;
        installation = freeInstallation
          ? 0
          : lines.reduce(
              (s, l) =>
                s + l.qty * zone.installation[catalog.variants[l.variantId]?.deliveryClass ?? "parcel"],
              0,
            );
        applied.push({
          id: deliveryPolicy.id,
          version: deliveryPolicy.version,
          type: "delivery",
          name: deliveryPolicy.name,
          benefit: `${zone.label}, giao trong ${zone.leadDays} ngày`,
        });
        if (zone.cutoff && day > zone.cutoff.date) {
          warnings.push(
            `Đã quá ngày chốt đơn ${zone.cutoff.label} (${zone.cutoff.date.split("-").reverse().join("/")})`,
          );
        }
      }
    }
  }

  // 5. Thiếu hàng.
  if (catalog.available) {
    const need = new Map<string, number>();
    for (const l of lines) need.set(l.variantId, (need.get(l.variantId) ?? 0) + l.qty);
    for (const [id, qty] of need) {
      const have = catalog.available[id] ?? 0;
      if (have < qty)
        warnings.push(`Thiếu hàng ${catalog.variants[id]?.name ?? id}: cần ${qty}, còn ${have}`);
    }
  }

  const discount = lines.reduce((s, l) => s + l.discount, 0);
  const fees = delivery + installation;
  const total = subtotal - discount + fees;

  // 6. Mức cọc tối thiểu.
  const depositPolicy = active.find((p): p is Extract<Policy, { type: "deposit" }> => p.type === "deposit");
  const deposit = depositPolicy
    ? {
        minimum: Math.min(
          total,
          Math.max(depositPolicy.rules.minAmount, round1k((total * depositPolicy.rules.minPercent) / 100)),
        ),
        holdDays: depositPolicy.rules.holdDays,
      }
    : { minimum: total, holdDays: 0 };

  return {
    lines: lines.map((l) => ({
      variantId: l.variantId,
      name: l.name,
      ...(l.comboId ? { comboId: l.comboId } : {}),
      qty: l.qty,
      unitPrice: l.unitPrice,
      listPrice: l.listPrice,
      discount: l.discount,
      total: l.total,
      isGift: l.isGift,
      policyIds: l.policyIds,
    })),
    appliedPolicies: applied,
    fees: { delivery, installation },
    totals: { subtotal, discount, fees, total },
    deposit,
    approvalsNeeded,
    warnings,
  };
}
