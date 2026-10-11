import type { PricingCatalog, PricingCombo, PricingVariant, Policy } from "@/lib/sales/pricing";
import { PRODUCTS, STOCK, VARIANTS } from "./data";

// Danh mục giá, combo, chính sách mô phỏng cho hàm định giá (lib/sales/pricing.ts). Toàn bộ là dữ liệu giả.

const productOf = (id: string) => PRODUCTS.find((p) => p.id === id)!;

export const PRICING_VARIANTS: Record<string, PricingVariant> = Object.fromEntries(
  VARIANTS.map((v) => {
    const p = productOf(v.productId);
    return [
      v.id,
      {
        id: v.id,
        name: `${p.name}${VARIANTS.filter((x) => x.productId === p.id).length > 1 ? ` (${v.name})` : ""}`,
        categoryId: p.category,
        price: v.price,
        deliveryClass: p.deliveryClass,
      },
    ];
  }),
);

export const COMBOS: Record<string, PricingCombo> = {
  "cb-x9-pillow": {
    id: "cb-x9-pillow",
    name: "Ghế DV-X9 + gối massage cổ (tặng)",
    pricingMode: "fixed_price",
    price: 79_900_000,
    items: [
      { variantId: "v-x9-br", qty: 1 },
      { variantId: "v-pillow", qty: 1, isGift: true },
    ],
    validFrom: "2026-09-01",
    validTo: null,
  },
  "cb-tho": {
    id: "cb-tho",
    name: "Gói quà mừng thọ: máy lọc ion kiềm + bộ lõi",
    pricingMode: "sum_minus",
    discount: 1_000_000,
    items: [
      { variantId: "v-ion", qty: 1 },
      { variantId: "v-core", qty: 1 },
    ],
    validFrom: "2026-09-01",
    validTo: "2026-12-31",
  },
};

const base = { version: 1, status: "active" as const, channels: null, validTo: null };

export const POLICIES: Policy[] = [
  {
    ...base,
    id: "pol-2010",
    type: "promotion",
    name: "Quà 20/10: đặt trước 13/10 tặng gối cổ, miễn phí lắp",
    validFrom: "2026-10-01",
    validTo: "2026-10-13",
    priority: 20,
    stackable: false,
    rules: {
      scope: { categoryIds: ["Ghế massage"] },
      benefit: { giftVariantIds: ["v-pillow"], freeInstallation: true },
    },
  },
  {
    ...base,
    id: "pol-ref",
    type: "promotion",
    name: "Khách được giới thiệu giảm 3%",
    validFrom: "2026-09-01",
    priority: 15,
    stackable: true,
    rules: { customerTags: ["referral"], benefit: { percentOff: 3 } },
  },
  {
    ...base,
    id: "pol-kr",
    type: "promotion",
    name: "Người đặt ở Hàn giảm 1 triệu cho ghế",
    validFrom: "2026-09-15",
    validTo: "2026-12-31",
    priority: 10,
    stackable: true,
    rules: {
      buyerCountries: ["KR"],
      scope: { categoryIds: ["Ghế massage"] },
      benefit: { amountOff: 1_000_000 },
    },
  },
  {
    ...base,
    id: "pol-ship",
    type: "delivery",
    name: "Giao lắp theo vùng",
    validFrom: "2026-09-01",
    priority: 10,
    stackable: true,
    rules: {
      zones: [
        {
          label: "Nội thành TP.HCM",
          provinces: ["TP.HCM"],
          fee: 0,
          installation: { bulky: 0, parcel: 0 },
          leadDays: 2,
        },
        {
          label: "Miền Nam",
          provinces: ["Long An", "Bình Dương", "Đồng Nai", "Đồng Tháp", "Cần Thơ", "Tiền Giang"],
          fee: 500_000,
          installation: { bulky: 300_000, parcel: 0 },
          leadDays: 4,
        },
        {
          label: "Tỉnh xa",
          provinces: "*",
          fee: 1_500_000,
          installation: { bulky: 500_000, parcel: 0 },
          leadDays: 7,
          cutoff: { date: "2027-01-15", label: "giao trước Tết" },
        },
      ],
    },
  },
  {
    ...base,
    id: "pol-dep",
    type: "deposit",
    name: "Cọc tối thiểu 10 triệu, giữ hàng 14 ngày",
    validFrom: "2026-09-01",
    priority: 10,
    stackable: true,
    rules: { minAmount: 10_000_000, minPercent: 10, holdDays: 14 },
  },
  {
    ...base,
    id: "pol-limit",
    type: "discount_limit",
    name: "Giới hạn giảm tay theo vai trò",
    validFrom: "2026-09-01",
    priority: 10,
    stackable: true,
    rules: { byRole: { telesale: 5, sale_admin: 5, owner: 100 } },
  },
];

export const PROVINCES_ALL = [
  "TP.HCM",
  "Long An",
  "Bình Dương",
  "Đồng Nai",
  "Đồng Tháp",
  "Cần Thơ",
  "Tiền Giang",
  "Nghệ An",
  "Thanh Hóa",
  "Hà Tĩnh",
  "Hải Dương",
  "Thái Bình",
  "Bắc Giang",
  "Nam Định",
  "Bình Định",
  "Hà Nội",
];

export const AVAILABLE: Record<string, number> = STOCK.reduce<Record<string, number>>(
  (acc, [variantId, warehouse, onHand, reserved]) => {
    // Hàng trưng bày không tính vào tồn bán được.
    if (warehouse === "wh-demo") return acc;
    acc[variantId] = (acc[variantId] ?? 0) + onHand - reserved;
    return acc;
  },
  {},
);

export function demoCatalog(policies: Policy[] = POLICIES): PricingCatalog {
  return { variants: PRICING_VARIANTS, combos: COMBOS, policies, available: AVAILABLE };
}
