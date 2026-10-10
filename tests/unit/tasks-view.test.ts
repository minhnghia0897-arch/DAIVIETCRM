import { describe, expect, it } from "vitest";

import { dueGroup, formatDue } from "@/lib/tasks/view";

// Màn Việc bản thật nhóm và viết hạn theo giờ Việt Nam, không theo giờ máy chủ (máy chủ chạy UTC).
describe("hạn việc theo giờ VN", () => {
  // 14:00 ngày 06/10/2026 giờ VN = 07:00 UTC.
  const now = new Date("2026-10-06T07:00:00Z");

  it("đã qua là quá hạn", () => {
    expect(dueGroup("2026-10-06T06:59:00Z", now)).toBe("overdue");
  });

  it("còn trong ngày VN là hôm nay, kể cả khi UTC đã sang ngày mới", () => {
    // 23:30 giờ VN ngày 06/10 = 16:30 UTC ngày 06/10.
    expect(dueGroup("2026-10-06T16:30:00Z", now)).toBe("today");
    // 00:30 giờ VN ngày 07/10 = 17:30 UTC ngày 06/10: cùng ngày UTC nhưng đã sang ngày VN.
    expect(dueGroup("2026-10-06T17:30:00Z", now)).toBe("later");
  });

  it("viết hạn ngắn gọn", () => {
    expect(formatDue("2026-10-06T08:30:00Z", now)).toBe("15:30");
    expect(formatDue("2026-10-07T02:00:00Z", now)).toBe("Mai 09:00");
    expect(formatDue("2026-10-12T02:00:00Z", now)).toBe("12/10 09:00");
  });
});
