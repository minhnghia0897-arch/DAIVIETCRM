import { z } from "zod";

import type { Policy } from "./pricing";

// Quy tắc của từng loại chính sách (CLAUDE.md 8.5), kiểm ở server trước khi lưu và khi nạp vào hàm định giá.
// Bốn loại đi vào hàm định giá (khuyến mãi, giao lắp, đặt cọc, giới hạn giảm); ba loại còn lại (thanh toán, bảo hành,
// đổi trả) là nội dung hiện cho khách trên báo giá và cho nhân viên khi tư vấn.

export const POLICY_TYPES = [
  "promotion",
  "delivery",
  "deposit",
  "discount_limit",
  "payment",
  "warranty",
  "return",
] as const;
export type PolicyType = (typeof POLICY_TYPES)[number];

export const POLICY_TYPE_LABEL: Record<PolicyType, string> = {
  promotion: "Khuyến mãi",
  delivery: "Giao lắp",
  deposit: "Đặt cọc",
  discount_limit: "Giới hạn giảm giá",
  payment: "Thanh toán",
  warranty: "Bảo hành",
  return: "Đổi trả",
};

/** Kênh bán áp chính sách, combo (để trống là mọi kênh). */
export const SALES_CHANNELS: { key: string; label: string }[] = [
  { key: "online", label: "Online (hội thoại, điện thoại)" },
  { key: "showroom", label: "Tại showroom" },
];

const money = z.number().int().min(0).max(10_000_000_000);
const pct = z.number().min(0).max(100);
const ids = z.array(z.string().min(1).max(64)).max(200);

export const promotionRules = z.object({
  scope: z
    .object({ variantIds: ids.optional(), categoryIds: ids.optional(), comboIds: ids.optional() })
    .optional(),
  minSubtotal: money.optional(),
  buyerCountries: z.array(z.string().min(2).max(10)).max(20).optional(),
  customerTags: z.array(z.string().min(1).max(40)).max(20).optional(),
  benefit: z
    .object({
      percentOff: pct.optional(),
      amountOff: money.optional(),
      giftVariantIds: ids.optional(),
      freeInstallation: z.boolean().optional(),
      freeDelivery: z.boolean().optional(),
    })
    .refine(
      (b) =>
        Boolean(
          b.percentOff || b.amountOff || b.giftVariantIds?.length || b.freeInstallation || b.freeDelivery,
        ),
      "Khuyến mãi cần ít nhất một lợi ích",
    ),
});

export const deliveryRules = z.object({
  zones: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        provinces: z.union([z.literal("*"), z.array(z.string().min(1).max(80)).min(1).max(80)]),
        fee: money,
        installation: z.object({ bulky: money, parcel: money }),
        leadDays: z.number().int().min(0).max(60),
        cutoff: z
          .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string().max(80) })
          .optional(),
      }),
    )
    .min(1)
    .max(30),
});

export const depositRules = z.object({
  minAmount: money,
  minPercent: pct,
  holdDays: z.number().int().min(1).max(90),
});

export const discountLimitRules = z.object({ byRole: z.record(z.string().min(1).max(40), pct) });

export const textRules = z.object({ text: z.string().trim().min(1).max(2000) });

export const RULES_SCHEMA: Record<PolicyType, z.ZodType> = {
  promotion: promotionRules,
  delivery: deliveryRules,
  deposit: depositRules,
  discount_limit: discountLimitRules,
  payment: textRules,
  warranty: textRules,
  return: textRules,
};

export interface PolicyRow {
  id: string;
  policy_key: string;
  version: number;
  type: string;
  name: string;
  status: string;
  valid_from: string;
  valid_to: string | null;
  channels: string[] | null;
  priority: number;
  stackable: boolean;
  rules: unknown;
}

const PRICED = new Set(["promotion", "delivery", "deposit", "discount_limit"]);

/** Dòng chính sách trong database → chính sách của hàm định giá; quy tắc sai thì bỏ qua (không áp). */
export function toPricingPolicy(row: PolicyRow): Policy | null {
  if (!PRICED.has(row.type)) return null;
  const parsed = RULES_SCHEMA[row.type as PolicyType].safeParse(row.rules);
  if (!parsed.success) return null;
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    status: row.status as Policy["status"],
    validFrom: row.valid_from,
    validTo: row.valid_to,
    channels: row.channels && row.channels.length ? row.channels : null,
    priority: row.priority,
    stackable: row.stackable,
    type: row.type,
    rules: parsed.data,
  } as Policy;
}
