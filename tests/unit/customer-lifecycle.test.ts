import { describe, expect, it } from "vitest";

import { consentState, lifecycleOf, stoppedContact, type ConsentRow } from "@/lib/cdp/lifecycle";
import { describeEvent } from "@/lib/leads/activity";

// Màn Khách bản thật: cách đọc đồng ý phải khớp contact_blocked ở database (dòng mới nhất của kênh hoặc "mọi kênh"
// quyết định), nhãn vòng đời và dòng sự kiện của khách.

const row = (o: Partial<ConsentRow>): ConsentRow => ({
  purpose: "marketing",
  channel: "all",
  granted: true,
  granted_at: "2026-10-01T00:00:00Z",
  withdrawn_at: null,
  source: "form",
  ...o,
});

describe("đồng ý theo mục đích và kênh (bản thật)", () => {
  it("chưa có dòng nào: chăm sóc được, tiếp thị chưa được", () => {
    expect(consentState([], "care", "call")).toEqual({ state: "default", allowed: true });
    expect(consentState([], "marketing", "zalo_oa")).toEqual({ state: "default", allowed: false });
  });

  it("dòng mọi kênh áp cho từng kênh, dòng mới nhất quyết định", () => {
    const rows = [
      row({ granted: true, granted_at: "2026-10-01T00:00:00Z" }),
      row({
        channel: "zalo_oa",
        granted: false,
        granted_at: "2026-10-05T00:00:00Z",
        source: "Khách yêu cầu",
      }),
    ];
    expect(consentState(rows, "marketing", "zalo_oa")).toEqual({
      state: "denied",
      allowed: false,
      source: "Khách yêu cầu",
    });
    expect(consentState(rows, "marketing", "call").allowed).toBe(true);
  });

  it("rút đồng ý thì không còn hiệu lực", () => {
    const rows = [row({ withdrawn_at: "2026-10-03T00:00:00Z" })];
    expect(consentState(rows, "marketing", "all").allowed).toBe(false);
  });

  it("ngừng mọi liên hệ: chăm sóc, mọi kênh bị từ chối; đồng ý lại thì hết", () => {
    const stop = row({ purpose: "care", granted: false, granted_at: "2026-10-02T00:00:00Z" });
    expect(stoppedContact([stop])).toBe(true);
    expect(consentState([stop], "care", "call").allowed).toBe(false);
    const again = row({ purpose: "care", granted: true, granted_at: "2026-10-04T00:00:00Z" });
    expect(stoppedContact([stop, again])).toBe(false);
  });
});

describe("nhãn vòng đời khách", () => {
  it("giai đoạn lạ hoặc trống về Đang hỏi", () => {
    expect(lifecycleOf("loyal").label).toBe("Khách thân");
    expect(lifecycleOf(null).label).toBe("Đang hỏi");
    expect(lifecycleOf("khong_co").label).toBe("Đang hỏi");
  });
});

describe("dòng sự kiện của khách", () => {
  const ctx = { names: new Map<string, string>(), now: new Date("2026-10-12T03:00:00Z") };

  it("đơn, thanh toán, giao lắp đọc được bằng tiếng Việt", () => {
    expect(describeEvent("order_status_changed", { code: "Q4-2610-0001", to: "deposit_paid" }, ctx)).toEqual({
      kind: "Đơn hàng",
      text: "Đơn Q4-2610-0001: Đã cọc",
    });
    expect(
      describeEvent("payment_confirmed", { code: "Q4-2610-0001", type: "deposit", amount: 10000000 }, ctx)
        .text,
    ).toBe("Xác nhận tiền về tiền cọc 10.000.000đ, đơn Q4-2610-0001");
    expect(describeEvent("delivery_step", { code: "Q4-2610-0001", step: "stock_issued" }, ctx).text).toBe(
      "Đơn Q4-2610-0001: Đã xuất kho, gán serial",
    );
  });

  it("đồng ý: ngừng mọi liên hệ ghi riêng", () => {
    expect(
      describeEvent("consent_changed", { purpose: "care", channel: "all", granted: false }, ctx).text,
    ).toBe("Khách yêu cầu ngừng mọi liên hệ");
    expect(
      describeEvent("consent_changed", { purpose: "marketing", channel: "zalo_oa", granted: true }, ctx).text,
    ).toBe("Khách đồng ý: Tin khuyến mãi, làm nóng lại, Zalo OA");
  });
});
