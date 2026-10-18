import { describe, expect, it } from "vitest";

import { toPersistPayload, toQuoteInput, type Cart } from "@/lib/sales/checkout";
import { priceQuote, type PricingCatalog } from "@/lib/sales/pricing";

const catalog: PricingCatalog = {
  variants: {
    a: { id: "a", name: "Ghế A", categoryId: "chair", price: 49_000_000, deliveryClass: "bulky" },
    b: { id: "b", name: "Ghế B", categoryId: "chair", price: 16_050_000, deliveryClass: "bulky" },
    g: { id: "g", name: "Gối cổ", categoryId: "gift", price: 900_000, deliveryClass: "parcel" },
    card: {
      id: "card",
      name: "Thiệp chúc",
      categoryId: "gift",
      price: 0,
      deliveryClass: "parcel",
      giftOnly: true,
    },
    pad: {
      id: "pad",
      name: "Đệm ghế",
      categoryId: "gift",
      price: 500_000,
      deliveryClass: "parcel",
      giftOnly: true,
    },
  },
  combos: {
    c: {
      id: "c",
      name: "Ghế A + gối",
      pricingMode: "sum_minus",
      discount: 1_000_000,
      items: [
        { variantId: "a", qty: 1 },
        { variantId: "g", qty: 1, isGift: true },
      ],
    },
  },
  policies: [
    {
      id: "dep",
      version: 1,
      name: "Cọc",
      status: "active",
      validFrom: "2026-01-01",
      validTo: null,
      channels: null,
      priority: 0,
      stackable: false,
      type: "deposit",
      rules: { minAmount: 10_000_000, minPercent: 10, holdDays: 14 },
    },
    {
      id: "lim",
      version: 1,
      name: "Giới hạn",
      status: "active",
      validFrom: "2026-01-01",
      validTo: null,
      channels: null,
      priority: 0,
      stackable: false,
      type: "discount_limit",
      rules: { byRole: { telesale: 5, owner: 100 } },
    },
  ],
};

const ctx = {
  showroomId: "q4",
  channel: "online",
  buyerCountry: "KR",
  customerTags: [],
  recipientProvince: "Nghệ An",
  date: new Date("2026-10-11T10:00:00+07:00"),
  sellerId: "u",
  sellerRole: "telesale",
};

const cart = (c: Partial<Cart>): Cart => ({
  lines: [{ variantId: "a", qty: 1 }],
  discount: null,
  deliveryFee: null,
  installationFee: null,
  ...c,
});

describe("toQuoteInput + priceQuote", () => {
  it("giảm số tiền cho cả đơn chia theo giá trị dòng, phí nhập tay được dùng", () => {
    const r = priceQuote(
      toQuoteInput(
        cart({
          lines: [
            { variantId: "a", qty: 1 },
            { variantId: "b", qty: 1 },
          ],
          discount: { type: "amount", value: 1_000_000 },
          deliveryFee: 500_000,
          installationFee: 300_000,
        }),
        ctx,
        catalog,
      ),
      catalog,
    );
    expect(r.totals).toEqual({ subtotal: 65_050_000, discount: 1_000_000, fees: 800_000, total: 64_850_000 });
    expect(r.approvalsNeeded).toEqual([]);
    expect(r.deposit.minimum).toBe(10_000_000);
  });

  it("giảm 7% vượt giới hạn telesale thì cần duyệt; Owner thì không", () => {
    const input = toQuoteInput(cart({ discount: { type: "pct", value: 7 } }), ctx, catalog);
    expect(priceQuote(input, catalog).approvalsNeeded).toHaveLength(1);
    const owner = toQuoteInput(
      cart({ discount: { type: "pct", value: 7 } }),
      { ...ctx, sellerRole: "owner" },
      catalog,
    );
    expect(priceQuote(owner, catalog).approvalsNeeded).toHaveLength(0);
  });

  it("combo có quà: tách dòng, quà giá 0, giá combo trừ khoản giảm", () => {
    const r = priceQuote(toQuoteInput(cart({ lines: [{ comboId: "c", qty: 1 }] }), ctx, catalog), catalog);
    expect(r.lines.map((l) => [l.variantId, l.total, l.isGift])).toEqual([
      ["a", 48_000_000, false],
      ["g", 0, true],
    ]);
    expect(r.totals.total).toBe(48_000_000);
  });
});

describe("quà tặng kèm người bán thêm", () => {
  it("dòng quà giá 0đ, không nhận giảm tay, không đổi tổng tiền", () => {
    const r = priceQuote(
      toQuoteInput(
        cart({
          lines: [
            { variantId: "a", qty: 1 },
            { variantId: "card", qty: 2, isGift: true },
            { variantId: "pad", qty: 1, isGift: true },
          ],
          discount: { type: "amount", value: 1_000_000 },
        }),
        ctx,
        catalog,
      ),
      catalog,
    );
    expect(r.lines.map((l) => [l.variantId, l.qty, l.unitPrice, l.discount, l.total, l.isGift])).toEqual([
      ["a", 1, 49_000_000, 1_000_000, 48_000_000, false],
      ["card", 2, 0, 0, 0, true],
      ["pad", 1, 0, 0, 0, true],
    ]);
    expect(r.totals).toEqual({ subtotal: 49_000_000, discount: 1_000_000, fees: 0, total: 48_000_000 });
    // Quà là sản phẩm chỉ làm quà tặng: không tính vào giới hạn giảm (1.000.000 / 49.000.000 ≈ 2%).
    expect(r.approvalsNeeded).toEqual([]);
    const p = toPersistPayload(r);
    expect(p.lines.filter((l) => l.is_gift).map((l) => l.variant_id)).toEqual(["card", "pad"]);
    expect(p.lines.reduce((s, l) => s + l.total, 0)).toBe(p.subtotal - p.discount);
  });

  it("phần trăm giảm tay không áp vào quà", () => {
    const r = priceQuote(
      toQuoteInput(
        cart({
          lines: [
            { variantId: "b", qty: 1 },
            { variantId: "g", qty: 1, isGift: true },
          ],
          discount: { type: "pct", value: 5 },
        }),
        { ...ctx, sellerRole: "owner" },
        catalog,
      ),
      catalog,
    );
    expect(r.lines.find((l) => l.isGift)).toMatchObject({ unitPrice: 0, discount: 0, total: 0 });
  });

  it("tặng hàng đang bán: giá lẻ của quà tính như giảm tay khi kiểm giới hạn", () => {
    // Gối cổ 900.000 tặng kèm ghế 49.000.000: 900.000 / 49.900.000 ≈ 1,8%, trong giới hạn 5%.
    const small = priceQuote(
      toQuoteInput(
        cart({
          lines: [
            { variantId: "a", qty: 1 },
            { variantId: "g", qty: 1, isGift: true },
          ],
        }),
        ctx,
        catalog,
      ),
      catalog,
    );
    expect(small.approvalsNeeded).toEqual([]);
    expect(small.totals.total).toBe(49_000_000);

    // Tặng thêm 2% giảm tay: (980.000 + 900.000) / 49.900.000 ≈ 3,8%, vẫn trong giới hạn.
    const mixed = priceQuote(
      toQuoteInput(
        cart({
          lines: [
            { variantId: "a", qty: 1 },
            { variantId: "g", qty: 1, isGift: true },
          ],
          discount: { type: "pct", value: 2 },
        }),
        ctx,
        catalog,
      ),
      catalog,
    );
    expect(mixed.approvalsNeeded).toEqual([]);

    // Tặng một ghế 16.050.000 kèm ghế 49.000.000: 16.050.000 / 65.050.000 ≈ 24,7%, cần Owner duyệt.
    const big = priceQuote(
      toQuoteInput(
        cart({
          lines: [
            { variantId: "a", qty: 1 },
            { variantId: "b", qty: 1, isGift: true },
          ],
        }),
        ctx,
        catalog,
      ),
      catalog,
    );
    expect(big.approvalsNeeded.map((a) => a.reason)).toEqual(["Quà tặng 24,7% vượt giới hạn 5% của vai trò"]);
    expect(big.totals.total).toBe(49_000_000);

    const owner = priceQuote(
      toQuoteInput(
        cart({
          lines: [
            { variantId: "a", qty: 1 },
            { variantId: "b", qty: 1, isGift: true },
          ],
        }),
        { ...ctx, sellerRole: "owner" },
        catalog,
      ),
      catalog,
    );
    expect(owner.approvalsNeeded).toEqual([]);
  });

  it("giảm tay cộng quà vượt giới hạn thì lý do ghi cả hai", () => {
    const r = priceQuote(
      toQuoteInput(
        cart({
          lines: [
            { variantId: "a", qty: 1 },
            { variantId: "g", qty: 1, isGift: true },
          ],
          discount: { type: "pct", value: 4 },
        }),
        ctx,
        catalog,
      ),
      catalog,
    );
    // (1.960.000 + 900.000) / 49.900.000 ≈ 5,7%.
    expect(r.approvalsNeeded.map((a) => a.reason)).toEqual([
      "Giảm tay và quà tặng 5,7% vượt giới hạn 5% của vai trò",
    ]);
  });
});

describe("toPersistPayload", () => {
  it("khớp kiểm số học của database và bỏ chính sách mặc định không có id thật", () => {
    const r = priceQuote(
      toQuoteInput(cart({ discount: { type: "amount", value: 2_000_000 }, deliveryFee: 0 }), ctx, catalog),
      catalog,
    );
    const p = toPersistPayload({
      ...r,
      appliedPolicies: [
        ...r.appliedPolicies,
        { id: "settings-deposit", version: 1, type: "deposit", name: "x", benefit: "" },
        {
          id: "7f0c5d0e-1b2a-4c3d-8e9f-0a1b2c3d4e5f",
          version: 2,
          type: "promotion",
          name: "KM",
          benefit: "giảm",
        },
      ],
    });
    const lineSum = p.lines.reduce((s, l) => s + l.total, 0);
    expect(lineSum).toBe(p.subtotal - p.discount);
    expect(p.total).toBe(lineSum + p.delivery_fee + p.installation_fee);
    expect(p.applied.map((a) => a.id)).toEqual(["7f0c5d0e-1b2a-4c3d-8e9f-0a1b2c3d4e5f"]);
  });
});
