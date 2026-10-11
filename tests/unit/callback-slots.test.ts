import { describe, expect, it } from "vitest";

import { callbackSlots, marketWindowsFromDb } from "@/lib/leads/callback-slots";

// Khung gọi đúng như dữ liệu tham chiếu trong bảng markets (1 = Thứ Hai … 7 = Chủ nhật).
const KR = marketWindowsFromDb("Asia/Seoul", [
  { days: [1, 2, 3, 4, 5], start: "19:00", end: "22:30" },
  { days: [6, 7], start: "09:00", end: "22:30" },
]);

describe("gợi ý giờ hẹn gọi lại theo khung của khách", () => {
  it("đổi Chủ nhật từ 7 sang 0", () => {
    expect(KR.windows[0]).toEqual([["09:00", "22:30"]]);
    expect(KR.windows[1]).toEqual([["19:00", "22:30"]]);
  });

  it("khách ở Hàn, 10:00 sáng thứ Ba giờ VN: chờ tới 19:00 giờ Hàn", () => {
    // Thứ Ba 06/10/2026 10:00 giờ VN = 03:00 UTC = 12:00 giờ Hàn.
    const slots = callbackSlots(new Date("2026-10-06T03:00:00Z"), KR);
    expect(slots[0].label).toBe("Hôm nay 19:00");
    expect(slots[0].at).toBe("2026-10-06T10:00:00.000Z");
    expect(slots[1].label).toBe("Mai 19:00");
  });

  it("cuối tuần khung mở từ 09:00", () => {
    // Thứ Sáu 09/10/2026 23:00 giờ Hàn: hết khung, ngày mai thứ Bảy mở 09:00.
    const slots = callbackSlots(new Date("2026-10-09T14:00:00Z"), KR);
    expect(slots[0].label).toBe("Mai 09:00");
  });

  it("không trả gợi ý trùng nhau", () => {
    const slots = callbackSlots(new Date("2026-10-06T03:00:00Z"), KR);
    expect(new Set(slots.map((s) => s.at)).size).toBe(slots.length);
  });
});
