import { describe, expect, it } from "vitest";

import { canContact, fromChannelList, type Consent } from "@/lib/cdp/consent";

const c = (o: Partial<Consent>): Consent => ({
  purpose: "marketing",
  channel: "all",
  granted: true,
  source: "form",
  ...o,
});

describe("đồng ý theo mục đích và kênh", () => {
  it("chăm sóc đơn không cần đồng ý tiếp thị", () => {
    expect(canContact([], "care", "zalo_oa").allowed).toBe(true);
  });

  it("tiếp thị cần đồng ý còn hiệu lực đúng mục đích và kênh", () => {
    expect(canContact([], "marketing", "zalo_oa").allowed).toBe(false);
    expect(canContact([c({})], "marketing", "zalo_oa").allowed).toBe(true);
    expect(canContact([c({ channel: "call" })], "marketing", "zalo_oa").allowed).toBe(false);
    expect(canContact([c({ withdrawnAt: "2026-10-01" })], "marketing", "zalo_oa").allowed).toBe(false);
    expect(canContact([c({ granted: false })], "marketing", "zalo_oa").allowed).toBe(false);
    expect(canContact([c({})], "ads_measurement", "all").allowed).toBe(false);
  });

  it("rút đồng ý chăm sóc một kênh chỉ chặn kênh đó; ngừng liên hệ chặn tất cả", () => {
    const list = [c({ purpose: "care", channel: "call", withdrawnAt: "2026-10-01" }), c({})];
    expect(canContact(list, "care", "call").allowed).toBe(false);
    expect(canContact(list, "care", "zalo_oa").allowed).toBe(true);
    const stop = [c({ purpose: "care", channel: "all", withdrawnAt: "2026-10-01" }), c({})];
    expect(canContact(stop, "marketing", "zalo_oa")).toEqual({
      allowed: false,
      reason: "Khách đã yêu cầu ngừng liên hệ",
    });
  });

  it("chuyển dữ liệu đồng ý theo kênh sang theo mục đích", () => {
    expect(
      fromChannelList(
        [
          { channel: "call", granted: true },
          { channel: "marketing", granted: false },
        ],
        "form",
      ),
    ).toEqual([
      { purpose: "care", channel: "call", granted: true, source: "form" },
      { purpose: "marketing", channel: "all", granted: false, source: "form" },
    ]);
  });
});
