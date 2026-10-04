import { describe, expect, it } from "vitest";

import { priceQuote, type Policy, type PricingCatalog, type QuoteInput } from "@/lib/sales/pricing";

// Bao phủ các yêu cầu của CLAUDE.md 8.5: cộng dồn và không cộng dồn, combo có quà, giảm vượt mức cần duyệt,
// phí giao theo tỉnh, hết hạn chính sách đúng ngày, làm tròn tiền.

const base = {
  version: 1,
  status: "active" as const,
  channels: null,
  validTo: null,
  stackable: true,
  priority: 10,
};

const catalog = (policies: Policy[], extra: Partial<PricingCatalog> = {}): PricingCatalog => ({
  variants: {
    chair: { id: "chair", name: "Ghế A", categoryId: "chair", price: 50_000_000, deliveryClass: "bulky" },
    pillow: { id: "pillow", name: "Gối", categoryId: "gift", price: 700_000, deliveryClass: "parcel" },
    filter: { id: "filter", name: "Máy lọc", categoryId: "water", price: 15_000_000, deliveryClass: "bulky" },
    core: { id: "core", name: "Lõi", categoryId: "core", price: 1_333_333, deliveryClass: "parcel" },
  },
  combos: {
    gift: {
      id: "gift",
      name: "Ghế + gối tặng",
      pricingMode: "fixed_price",
      price: 48_000_000,
      items: [
        { variantId: "chair", qty: 1 },
        { variantId: "pillow", qty: 1, isGift: true },
      ],
    },
    tho: {
      id: "tho",
      name: "Máy lọc + lõi",
      pricingMode: "sum_minus",
      discount: 1_000_000,
      items: [
        { variantId: "filter", qty: 1 },
        { variantId: "core", qty: 1 },
      ],
    },
  },
  policies,
  ...extra,
});

const ctx = (over: Partial<QuoteInput["context"]> = {}): QuoteInput["context"] => ({
  showroomId: "q4",
  channel: "online",
  buyerCountry: "VN",
  customerTags: [],
  recipientProvince: "TP.HCM",
  date: new Date("2026-10-05T10:00:00+07:00"),
  sellerId: "u1",
  sellerRole: "telesale",
  ...over,
});

const limit: Policy = {
  ...base,
  id: "limit",
  type: "discount_limit",
  name: "Giới hạn",
  validFrom: "2026-01-01",
  rules: { byRole: { telesale: 5, owner: 100 } },
};

describe("priceQuote", () => {
  it("tính giá lẻ khi không có chính sách", () => {
    const r = priceQuote({ lines: [{ variantId: "chair", qty: 2 }], context: ctx() }, catalog([]));
    expect(r.totals).toEqual({ subtotal: 100_000_000, discount: 0, fees: 0, total: 100_000_000 });
    expect(r.deposit.minimum).toBe(100_000_000);
  });

  it("cộng dồn hai khuyến mãi cộng dồn được", () => {
    const policies: Policy[] = [
      {
        ...base,
        id: "a",
        type: "promotion",
        name: "Giảm 10%",
        validFrom: "2026-01-01",
        priority: 20,
        rules: { benefit: { percentOff: 10 } },
      },
      {
        ...base,
        id: "b",
        type: "promotion",
        name: "Giảm 1tr",
        validFrom: "2026-01-01",
        priority: 10,
        rules: { benefit: { amountOff: 1_000_000 } },
      },
    ];
    const r = priceQuote({ lines: [{ variantId: "chair", qty: 1 }], context: ctx() }, catalog(policies));
    expect(r.totals.discount).toBe(6_000_000);
    expect(r.appliedPolicies.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("khuyến mãi không cộng dồn loại khuyến mãi thấp hơn cùng phạm vi, không loại phạm vi khác", () => {
    const policies: Policy[] = [
      {
        ...base,
        id: "hi",
        type: "promotion",
        name: "Ghế giảm 10%",
        validFrom: "2026-01-01",
        priority: 20,
        stackable: false,
        rules: { scope: { categoryIds: ["chair"] }, benefit: { percentOff: 10 } },
      },
      {
        ...base,
        id: "lo",
        type: "promotion",
        name: "Ghế giảm 1tr",
        validFrom: "2026-01-01",
        priority: 10,
        rules: { scope: { categoryIds: ["chair"] }, benefit: { amountOff: 1_000_000 } },
      },
      {
        ...base,
        id: "water",
        type: "promotion",
        name: "Máy lọc giảm 5%",
        validFrom: "2026-01-01",
        priority: 5,
        rules: { scope: { categoryIds: ["water"] }, benefit: { percentOff: 5 } },
      },
    ];
    const r = priceQuote(
      {
        lines: [
          { variantId: "chair", qty: 1 },
          { variantId: "filter", qty: 1 },
        ],
        context: ctx(),
      },
      catalog(policies),
    );
    expect(r.appliedPolicies.map((p) => p.id)).toEqual(["hi", "water"]);
    expect(r.totals.discount).toBe(5_000_000 + 750_000);
  });

  it("tách combo có quà, phân bổ giá combo theo giá lẻ và giữ combo_id", () => {
    const r = priceQuote({ lines: [{ comboId: "gift", qty: 1 }], context: ctx() }, catalog([]));
    expect(r.lines).toHaveLength(2);
    expect(r.lines.every((l) => l.comboId === "gift")).toBe(true);
    const gift = r.lines.find((l) => l.isGift)!;
    expect(gift.total).toBe(0);
    expect(r.totals.total).toBe(48_000_000);
    expect(r.totals.subtotal - r.totals.discount).toBe(48_000_000);
  });

  it("combo trừ tiền phân bổ đủ tới từng đồng", () => {
    const r = priceQuote({ lines: [{ comboId: "tho", qty: 3 }], context: ctx() }, catalog([]));
    const sum = r.lines.reduce((s, l) => s + l.total, 0);
    expect(sum).toBe((15_000_000 + 1_333_333 - 1_000_000) * 3);
    expect(r.lines.every((l) => Number.isInteger(l.total))).toBe(true);
  });

  it("giảm tay vượt giới hạn vai trò thì cần duyệt, trong giới hạn thì không", () => {
    const over = priceQuote(
      {
        lines: [{ variantId: "chair", qty: 1, manualDiscount: { kind: "percent", value: 7 } }],
        context: ctx(),
      },
      catalog([limit]),
    );
    expect(over.approvalsNeeded).toHaveLength(1);
    expect(over.approvalsNeeded[0].reason).toContain("7,0%");
    expect(over.approvalsNeeded[0].policyId).toBe("limit");

    const ok = priceQuote(
      {
        lines: [{ variantId: "chair", qty: 1, manualDiscount: { kind: "percent", value: 5 } }],
        context: ctx(),
      },
      catalog([limit]),
    );
    expect(ok.approvalsNeeded).toHaveLength(0);

    const owner = priceQuote(
      {
        lines: [{ variantId: "chair", qty: 1, manualDiscount: { kind: "percent", value: 20 } }],
        context: ctx({ sellerRole: "owner" }),
      },
      catalog([limit]),
    );
    expect(owner.approvalsNeeded).toHaveLength(0);
  });

  it("giảm tay áp sau khuyến mãi", () => {
    const promo: Policy = {
      ...base,
      id: "p",
      type: "promotion",
      name: "10%",
      validFrom: "2026-01-01",
      rules: { benefit: { percentOff: 10 } },
    };
    const r = priceQuote(
      {
        lines: [{ variantId: "chair", qty: 1, manualDiscount: { kind: "amount", value: 2_000_000 } }],
        context: ctx(),
      },
      catalog([promo]),
    );
    expect(r.lines[0].total).toBe(43_000_000);
  });

  it("phí giao, lắp theo tỉnh người nhận; miễn phí lắp từ khuyến mãi", () => {
    const ship: Policy = {
      ...base,
      id: "ship",
      type: "delivery",
      name: "Giao",
      validFrom: "2026-01-01",
      rules: {
        zones: [
          { label: "HCM", provinces: ["TP.HCM"], fee: 0, installation: { bulky: 0, parcel: 0 }, leadDays: 2 },
          {
            label: "Xa",
            provinces: "*",
            fee: 1_500_000,
            installation: { bulky: 500_000, parcel: 0 },
            leadDays: 7,
          },
        ],
      },
    };
    const hcm = priceQuote({ lines: [{ variantId: "chair", qty: 1 }], context: ctx() }, catalog([ship]));
    expect(hcm.fees).toEqual({ delivery: 0, installation: 0 });
    const far = priceQuote(
      {
        lines: [
          { variantId: "chair", qty: 2 },
          { variantId: "pillow", qty: 1 },
        ],
        context: ctx({ recipientProvince: "Nghệ An" }),
      },
      catalog([ship]),
    );
    expect(far.fees).toEqual({ delivery: 1_500_000, installation: 1_000_000 });
    expect(far.totals.total).toBe(100_700_000 + 2_500_000);

    const free: Policy = {
      ...base,
      id: "free",
      type: "promotion",
      name: "Miễn lắp",
      validFrom: "2026-01-01",
      rules: { benefit: { freeInstallation: true } },
    };
    const r = priceQuote(
      { lines: [{ variantId: "chair", qty: 1 }], context: ctx({ recipientProvince: "Nghệ An" }) },
      catalog([ship, free]),
    );
    expect(r.fees).toEqual({ delivery: 1_500_000, installation: 0 });

    const none = priceQuote(
      { lines: [{ variantId: "chair", qty: 1 }], context: ctx({ recipientProvince: undefined }) },
      catalog([ship]),
    );
    expect(none.warnings).toContain("Chưa có tỉnh người nhận, chưa tính phí giao lắp");
  });

  it("chính sách hết hạn đúng ngày theo giờ Việt Nam", () => {
    const promo: Policy = {
      ...base,
      id: "p",
      type: "promotion",
      name: "Đến 13/10",
      validFrom: "2026-10-01",
      validTo: "2026-10-13",
      rules: { benefit: { amountOff: 1_000_000 } },
    };
    const at = (iso: string) =>
      priceQuote(
        { lines: [{ variantId: "chair", qty: 1 }], context: ctx({ date: new Date(iso) }) },
        catalog([promo]),
      ).appliedPolicies.length;
    expect(at("2026-10-13T23:59:00+07:00")).toBe(1);
    // 17:30 UTC ngày 13 là 00:30 ngày 14 giờ VN: đã hết hạn.
    expect(at("2026-10-13T17:30:00Z")).toBe(0);
    expect(at("2026-09-30T23:00:00+07:00")).toBe(0);
    const paused = priceQuote(
      { lines: [{ variantId: "chair", qty: 1 }], context: ctx() },
      catalog([{ ...promo, status: "paused" }]),
    );
    expect(paused.appliedPolicies).toHaveLength(0);
  });

  it("làm tròn khoản giảm theo nghìn đồng và tiền luôn là số nguyên", () => {
    const promo: Policy = {
      ...base,
      id: "p",
      type: "promotion",
      name: "7%",
      validFrom: "2026-01-01",
      rules: { benefit: { percentOff: 7 } },
    };
    const r = priceQuote({ lines: [{ variantId: "core", qty: 1 }], context: ctx() }, catalog([promo]));
    expect(r.lines[0].discount).toBe(93_000);
    expect(r.lines[0].total).toBe(1_240_333);
  });

  it("cọc tối thiểu là mức lớn hơn giữa số tiền và phần trăm, không quá tổng", () => {
    const dep: Policy = {
      ...base,
      id: "d",
      type: "deposit",
      name: "Cọc",
      validFrom: "2026-01-01",
      rules: { minAmount: 10_000_000, minPercent: 30, holdDays: 14 },
    };
    const big = priceQuote({ lines: [{ variantId: "chair", qty: 1 }], context: ctx() }, catalog([dep]));
    expect(big.deposit).toEqual({ minimum: 15_000_000, holdDays: 14 });
    const small = priceQuote({ lines: [{ variantId: "pillow", qty: 1 }], context: ctx() }, catalog([dep]));
    expect(small.deposit.minimum).toBe(700_000);
  });

  it("điều kiện thị trường người đặt và nhóm khách", () => {
    const kr: Policy = {
      ...base,
      id: "kr",
      type: "promotion",
      name: "Hàn",
      validFrom: "2026-01-01",
      rules: { buyerCountries: ["KR"], benefit: { amountOff: 1_000_000 } },
    };
    const ref: Policy = {
      ...base,
      id: "ref",
      type: "promotion",
      name: "Giới thiệu",
      validFrom: "2026-01-01",
      rules: { customerTags: ["referral"], benefit: { percentOff: 3 } },
    };
    const vn = priceQuote({ lines: [{ variantId: "chair", qty: 1 }], context: ctx() }, catalog([kr, ref]));
    expect(vn.appliedPolicies).toHaveLength(0);
    const both = priceQuote(
      {
        lines: [{ variantId: "chair", qty: 1 }],
        context: ctx({ buyerCountry: "KR", customerTags: ["referral"] }),
      },
      catalog([kr, ref]),
    );
    expect(both.appliedPolicies.map((p) => p.id).sort()).toEqual(["kr", "ref"]);
  });

  it("cảnh báo thiếu hàng và quá ngày chốt dịp lễ", () => {
    const ship: Policy = {
      ...base,
      id: "ship",
      type: "delivery",
      name: "Giao",
      validFrom: "2026-01-01",
      rules: {
        zones: [
          {
            label: "Xa",
            provinces: "*",
            fee: 0,
            installation: { bulky: 0, parcel: 0 },
            leadDays: 7,
            cutoff: { date: "2026-10-01", label: "giao trước Tết" },
          },
        ],
      },
    };
    const r = priceQuote(
      { lines: [{ variantId: "chair", qty: 3 }], context: ctx({ recipientProvince: "Nghệ An" }) },
      catalog([ship], { available: { chair: 2 } }),
    );
    expect(r.warnings).toContain("Thiếu hàng Ghế A: cần 3, còn 2");
    expect(r.warnings.some((w) => w.includes("giao trước Tết"))).toBe(true);
  });
});

describe("tỷ lệ giảm tay", () => {
  it("tính trên số tiền sau khuyến mãi, đúng con số người bán nhập", () => {
    const base2 = {
      version: 1,
      status: "active" as const,
      channels: null,
      validTo: null,
      stackable: true,
      priority: 10,
    };
    const policies: Policy[] = [
      {
        ...base2,
        id: "p",
        type: "promotion",
        name: "1tr",
        validFrom: "2026-01-01",
        rules: { benefit: { amountOff: 1_000_000 } },
      },
      {
        ...base2,
        id: "l",
        type: "discount_limit",
        name: "Giới hạn",
        validFrom: "2026-01-01",
        rules: { byRole: { telesale: 5 } },
      },
    ];
    const r = priceQuote(
      {
        lines: [{ variantId: "chair", qty: 1, manualDiscount: { kind: "percent", value: 7 } }],
        context: {
          showroomId: "q4",
          channel: "online",
          buyerCountry: "VN",
          customerTags: [],
          recipientProvince: "TP.HCM",
          date: new Date("2026-10-05T10:00:00+07:00"),
          sellerId: "u",
          sellerRole: "telesale",
        },
      },
      {
        variants: {
          chair: { id: "chair", name: "Ghế", categoryId: "c", price: 50_000_000, deliveryClass: "bulky" },
        },
        combos: {},
        policies,
      },
    );
    expect(r.approvalsNeeded[0].reason).toContain("7,0%");
  });
});
