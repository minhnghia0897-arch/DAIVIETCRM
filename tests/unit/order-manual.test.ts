import { describe, expect, it } from "vitest";

import { deniedReason } from "@/components/crm/access";
import { initialState, reducer, type CrmState, type OrderDraft } from "@/components/crm/store";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { demoCatalog } from "@/lib/demo/sales-catalog";
import { priceQuote } from "@/lib/sales/pricing";

// Tạo đơn tay và sửa đơn (CLAUDE.md 8.7): tiền từ hàm định giá, giảm vượt mức chờ duyệt, đơn đã cọc không đổi hàng.

const draft = (over: Partial<OrderDraft> = {}): OrderDraft => ({
  buyerName: "Khách showroom",
  buyerPhone: "0901234567",
  buyerMarket: "VN",
  buyFor: "other",
  recipientName: "Trần Văn Ba",
  recipientRelation: "Bố",
  keepSurprise: true,
  province: "TP.HCM",
  district: "Quận 4",
  ward: "Phường 6",
  street: "12 Hoàng Diệu",
  channel: "Khách đến showroom",
  giftMessage: "",
  lines: [{ variantId: "v-x9-br", qty: 1 }],
  ...over,
});

const price = (s: CrmState, d: OrderDraft, role = "telesale") =>
  priceQuote(
    {
      lines: d.lines,
      context: {
        showroomId: "q4",
        channel: "showroom",
        buyerCountry: d.buyerMarket,
        customerTags: [],
        recipientProvince: d.province,
        date: new Date(Date.UTC(2026, 9, 3, 3)),
        sellerId: "Thảo",
        sellerRole: role,
      },
    },
    demoCatalog(s.settings.policies),
  );

const telesale = {
  perms: new Set(PERMISSIONS.filter((p) => p.defaults.includes("telesale")).map((p) => p.key)),
  me: "Thảo",
  userId: "11111111-1111-4111-8111-000000000003",
  isOwner: false,
  readOnly: false,
};

describe("tạo đơn tay", () => {
  it("tạo đơn nháp với địa chỉ đủ 4 cấp, người nhận, giữ bất ngờ", () => {
    const s = initialState();
    const d = draft();
    const ns = reducer(s, {
      type: "createOrderManual",
      draft: d,
      result: price(s, d),
      actorId: telesale.userId,
      actor: "Thảo",
    });
    const o = ns.orders[0];
    expect(o.manual).toBe(true);
    expect(o.status).toBe("draft");
    expect(o.address).toBe("12 Hoàng Diệu, Phường 6, Quận 4, TP.HCM");
    expect(o.recipientName).toBe("Trần Văn Ba (bố)");
    expect(o.keepSurprise).toBe(true);
    expect(o.sellerId).toBe(telesale.userId);
    expect(ns.audit[0].action).toBe("Tạo đơn");
  });

  it("giảm vượt giới hạn thì đơn chờ duyệt; Owner duyệt thì về nháp", () => {
    const s = initialState();
    const d = draft({
      lines: [{ variantId: "v-x9-br", qty: 1, manualDiscount: { kind: "percent", value: 7 } }],
    });
    let ns = reducer(s, {
      type: "createOrderManual",
      draft: d,
      result: price(s, d),
      actorId: telesale.userId,
      actor: "Thảo",
    });
    const o = ns.orders[0];
    expect(o.status).toBe("pending_approval");
    const q = ns.queue.find((x) => x.kind === "order_discount" && x.ref === o.id)!;
    expect(q.perm).toBe("order.discount_approve");
    ns = reducer(ns, { type: "approve", id: q.id, ok: true, actor: "Hà", isOwner: true });
    expect(ns.orders.find((x) => x.id === o.id)!.status).toBe("draft");
  });

  it("telesale không có quyền thì không tạo được", () => {
    const s = initialState();
    const noCreate = { ...telesale, perms: new Set([...telesale.perms].filter((p) => p !== "order.create")) };
    const d = draft();
    expect(
      deniedReason(
        s,
        { type: "createOrderManual", draft: d, result: price(s, d), actorId: "x", actor: "Thảo" },
        noCreate,
      ),
    ).toBeTruthy();
  });
});

describe("sửa đơn", () => {
  it("sửa hàng tính lại tiền; đơn đã cọc chỉ sửa thông tin giao, không đổi hàng", () => {
    const s = initialState();
    const d = draft();
    let ns = reducer(s, {
      type: "createOrderManual",
      draft: d,
      result: price(s, d),
      actorId: telesale.userId,
      actor: "Thảo",
    });
    const id = ns.orders[0].id;
    const d2 = draft({ lines: [{ variantId: "v-x9-br", qty: 2 }] });
    ns = reducer(ns, { type: "editOrder", orderId: id, draft: d2, result: price(ns, d2), actor: "Thảo" });
    expect(ns.orders.find((x) => x.id === id)!.lines[0].qty).toBe(2);

    ns = { ...ns, orders: ns.orders.map((x) => (x.id === id ? { ...x, status: "deposit_paid" } : x)) };
    const d3 = draft({ lines: [{ variantId: "v-x9-br", qty: 5 }], street: "99 Khánh Hội" });
    ns = reducer(ns, { type: "editOrder", orderId: id, draft: d3, result: price(ns, d3), actor: "Thảo" });
    const o = ns.orders.find((x) => x.id === id)!;
    expect(o.lines[0].qty).toBe(2);
    expect(o.address.startsWith("99 Khánh Hội")).toBe(true);
  });
});
