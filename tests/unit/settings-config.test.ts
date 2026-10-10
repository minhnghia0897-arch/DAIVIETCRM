import { describe, expect, it } from "vitest";

import { catalogKey, isTimeZone, marketSchema, toVnRange } from "@/lib/settings/config";

const at = new Date("2026-10-08T03:00:00Z");

describe("cài đặt thị trường", () => {
  it("đổi khung gọi giờ Hàn sang giờ VN", () => {
    expect(toVnRange("19:00", "22:30", "Asia/Seoul", at)).toBe("17:00–20:30");
    expect(toVnRange("08:30", "20:30", "Asia/Ho_Chi_Minh", at)).toBe("08:30–20:30");
    expect(toVnRange("00:30", "02:00", "Asia/Seoul", at)).toBe("22:30 hôm trước–00:00");
  });

  it("kiểm tra múi giờ, mã quốc gia, ZNS chỉ cho VN, giờ kết thúc sau giờ bắt đầu", () => {
    expect(isTimeZone("Asia/Tokyo")).toBe(true);
    expect(isTimeZone("Tokyo")).toBe(false);
    const ok = {
      countryCode: "JP",
      name: "Nhật Bản",
      timezone: "Asia/Tokyo",
      callWindows: [{ days: [1, 2, 3, 4, 5], start: "19:00", end: "22:00" }],
      allowedChannels: ["call", "zalo_oa"],
      isActive: true,
    };
    expect(marketSchema.safeParse(ok).success).toBe(true);
    expect(marketSchema.safeParse({ ...ok, countryCode: "jp" }).success).toBe(false);
    expect(marketSchema.safeParse({ ...ok, allowedChannels: ["zns"] }).success).toBe(false);
    expect(
      marketSchema.safeParse({ ...ok, callWindows: [{ days: [1], start: "22:00", end: "19:00" }] }).success,
    ).toBe(false);
  });
});

describe("danh mục", () => {
  it("mã mục mới từ nhãn, không trùng", () => {
    expect(catalogKey("Quà Giáng sinh", new Set())).toBe("qua_giang_sinh");
    expect(catalogKey("Quà Giáng sinh", new Set(["qua_giang_sinh"]))).toBe("qua_giang_sinh_2");
    expect(catalogKey("Đổi ý", new Set())).toBe("doi_y");
  });
});
