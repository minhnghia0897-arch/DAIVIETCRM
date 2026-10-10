import { describe, expect, it } from "vitest";

import {
  applyMovements,
  comboAvailability,
  planDocument,
  reserve,
  type StockLevel,
} from "@/lib/sales/inventory";
import { leadStageFromOrder, transitionBlockers, type OrderFacts } from "@/lib/sales/orders";

const levels: StockLevel[] = [
  { variantId: "x9", warehouseId: "q4", onHand: 6, reserved: 4 },
  { variantId: "x9", warehouseId: "dv", onHand: 12, reserved: 0 },
  { variantId: "pillow", warehouseId: "q4", onHand: 30, reserved: 0 },
];

describe("phiếu kho", () => {
  it("phiếu nhập cộng tồn qua sổ kho, không sửa dữ liệu đầu vào", () => {
    const p = planDocument(levels, {
      id: "PN1",
      kind: "receipt",
      warehouseId: "q4",
      reason: "Nhập Đại Việt",
      lines: [{ variantId: "x9", qty: 3 }],
    });
    expect(p.errors).toEqual([]);
    const next = applyMovements(levels, p.movements);
    expect(next.find((l) => l.variantId === "x9" && l.warehouseId === "q4")?.onHand).toBe(9);
    expect(levels[0].onHand).toBe(6);
  });

  it("xuất, chuyển kho không vượt tồn khả dụng (trừ hàng đang giữ)", () => {
    const p = planDocument(levels, {
      id: "PX1",
      kind: "issue",
      warehouseId: "q4",
      reason: "",
      lines: [{ variantId: "x9", qty: 3 }],
    });
    expect(p.errors[0]).toContain("cần 3, còn 2");
    expect(p.movements).toEqual([]);
    const t = planDocument(levels, {
      id: "PC1",
      kind: "transfer",
      warehouseId: "dv",
      toWarehouseId: "q4",
      reason: "",
      lines: [{ variantId: "x9", qty: 5 }],
    });
    expect(t.errors).toEqual([]);
    const next = applyMovements(levels, t.movements);
    expect(next.find((l) => l.warehouseId === "dv")?.onHand).toBe(7);
    expect(next.find((l) => l.variantId === "x9" && l.warehouseId === "q4")?.onHand).toBe(11);
  });

  it("dòng trùng SKU được cộng dồn khi kiểm đủ hàng", () => {
    const p = planDocument(levels, {
      id: "PX2",
      kind: "issue",
      warehouseId: "q4",
      reason: "",
      lines: [
        { variantId: "x9", qty: 1 },
        { variantId: "x9", qty: 2 },
      ],
    });
    expect(p.errors).toHaveLength(1);
  });

  it("chuyển kho cần kho nhận khác kho xuất; số lượng phải nguyên dương", () => {
    expect(
      planDocument(levels, {
        id: "a",
        kind: "transfer",
        warehouseId: "q4",
        toWarehouseId: "q4",
        reason: "",
        lines: [{ variantId: "pillow", qty: 1 }],
      }).errors,
    ).toContain("Kho nhận phải khác kho xuất");
    expect(
      planDocument(levels, {
        id: "b",
        kind: "receipt",
        warehouseId: "q4",
        reason: "",
        lines: [{ variantId: "pillow", qty: 1.5 }],
      }).errors[0],
    ).toContain("số nguyên dương");
    expect(
      planDocument(levels, { id: "c", kind: "receipt", warehouseId: "q4", reason: "", lines: [] }).errors,
    ).toContain("Phiếu chưa có dòng nào");
  });

  it("kiểm kê sinh chênh lệch và cần duyệt; không lệch thì không cần duyệt", () => {
    const p = planDocument(levels, {
      id: "KK1",
      kind: "count",
      warehouseId: "q4",
      reason: "Kiểm kê tháng",
      lines: [
        { variantId: "x9", counted: 5 },
        { variantId: "pillow", counted: 32 },
      ],
    });
    expect(p.needsApproval).toBe(true);
    expect(p.movements.map((m) => [m.type, m.variantId, m.qty])).toEqual([
      ["adjust_minus", "x9", 1],
      ["adjust_plus", "pillow", 2],
    ]);
    const same = planDocument(levels, {
      id: "KK2",
      kind: "count",
      warehouseId: "q4",
      reason: "",
      lines: [{ variantId: "x9", counted: 6 }],
    });
    expect(same.needsApproval).toBe(false);
    const below = planDocument(levels, {
      id: "KK3",
      kind: "count",
      warehouseId: "q4",
      reason: "",
      lines: [{ variantId: "x9", counted: 3 }],
    });
    expect(below.errors[0]).toContain("nhỏ hơn hàng đang giữ");
  });

  it("không bao giờ để tồn âm", () => {
    expect(() =>
      applyMovements(levels, [
        { type: "sale_out", variantId: "pillow", warehouseId: "dv", qty: 1, ref: "x", reason: "" },
      ]),
    ).toThrow(/Tồn âm/);
  });

  it("giữ hàng không vượt khả dụng, nhả không xuống dưới 0", () => {
    expect(() => reserve(levels, "x9", "q4", 3)).toThrow();
    const r = reserve(levels, "x9", "q4", 2);
    expect(r[0].reserved).toBe(6);
    expect(reserve(levels, "x9", "q4", -10)[0].reserved).toBe(0);
  });

  it("tồn combo là số bộ lắp được từ thành phần", () => {
    expect(
      comboAvailability(
        [
          { variantId: "x9", qty: 1 },
          { variantId: "pillow", qty: 1 },
        ],
        levels,
        "q4",
      ),
    ).toBe(2);
    expect(comboAvailability([{ variantId: "x9", qty: 2 }], levels, "dv")).toBe(6);
    expect(comboAvailability([{ variantId: "none", qty: 1 }], levels, "q4")).toBe(0);
  });
});

const facts = (over: Partial<OrderFacts> = {}): OrderFacts => ({
  status: "confirmed",
  hasRecipient: true,
  hasAddress: true,
  total: 80_000_000,
  confirmedPaid: 0,
  depositMinimum: 10_000_000,
  codApproved: false,
  stockIssued: false,
  serialsAssigned: false,
  ...over,
});

describe("trạng thái đơn", () => {
  it("xác nhận cần người nhận và địa chỉ", () => {
    expect(
      transitionBlockers(facts({ status: "draft", hasRecipient: false, hasAddress: false }), "confirmed"),
    ).toEqual(["Chưa có người nhận", "Chưa có địa chỉ giao"]);
  });

  it("đã cọc cần tiền xác nhận đủ mức cọc", () => {
    expect(transitionBlockers(facts({ confirmedPaid: 5_000_000 }), "deposit_paid")).toHaveLength(1);
    expect(transitionBlockers(facts({ confirmedPaid: 10_000_000 }), "deposit_paid")).toEqual([]);
  });

  it("sẵn sàng giao cần đủ tiền hoặc được duyệt thu khi giao", () => {
    const f = facts({ status: "deposit_paid", confirmedPaid: 20_000_000 });
    expect(transitionBlockers(f, "ready_to_ship")).toHaveLength(1);
    expect(transitionBlockers({ ...f, codApproved: true }, "ready_to_ship")).toEqual([]);
    expect(transitionBlockers({ ...f, confirmedPaid: 80_000_000 }, "ready_to_ship")).toEqual([]);
  });

  it("đang giao cần phiếu xuất đã ghi sổ và serial", () => {
    const f = facts({ status: "ready_to_ship", confirmedPaid: 80_000_000 });
    expect(transitionBlockers(f, "delivering")).toEqual([
      "Chưa ghi sổ phiếu xuất kho",
      "Chưa gán serial cho hàng có serial",
    ]);
    expect(transitionBlockers({ ...f, stockIssued: true, serialsAssigned: true }, "delivering")).toEqual([]);
  });

  it("không nhảy bước, không hủy đơn đã kết thúc, đơn chờ duyệt không đi tiếp", () => {
    expect(transitionBlockers(facts(), "delivering")[0]).toContain("Không chuyển thẳng");
    expect(transitionBlockers(facts({ status: "completed" }), "cancelled")).toHaveLength(1);
    expect(transitionBlockers(facts({ status: "deposit_paid" }), "cancelled")).toEqual([]);
    expect(transitionBlockers(facts({ status: "pending_approval" }), "confirmed")).toEqual([
      "Đơn đang chờ duyệt giảm giá",
    ]);
  });

  it("giai đoạn lead sinh từ đơn", () => {
    expect(leadStageFromOrder("deposit_paid", false)).toBe("deposit");
    expect(leadStageFromOrder("ready_to_ship", true)).toBe("deposit");
    expect(leadStageFromOrder("ready_to_ship", false)).toBeNull();
    expect(leadStageFromOrder("completed", false)).toBe("won");
    expect(leadStageFromOrder("cancelled", false)).toBeNull();
  });
});
