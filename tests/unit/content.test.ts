import { describe, expect, it } from "vitest";

import {
  columnItems,
  contentSchema,
  isOverdue,
  publishTimeLabel,
  stageBlocker,
  vnDay,
  weekDays,
  type ContentItem,
} from "@/lib/marketing/content";

const base = {
  publishAt: null as string | null,
  postUrl: null as string | null,
  checks: { no_health_claim: false, customer_consent: false },
};

describe("luật cột của lịch nội dung", () => {
  it("các cột trước Đã lên lịch không cần gì thêm", () => {
    for (const s of ["idea", "script", "production", "review"] as const)
      expect(stageBlocker(base, s)).toBeNull();
  });
  it("lên lịch cần giờ đăng và hai mục kiểm nội dung; đã đăng cần thêm link", () => {
    expect(stageBlocker(base, "scheduled")).toMatch(/ngày giờ đăng/);
    const timed = { ...base, publishAt: "2026-10-20T12:00:00Z" };
    expect(stageBlocker(timed, "scheduled")).toMatch(/kiểm nội dung/);
    const checked = { ...timed, checks: { no_health_claim: true, customer_consent: true } };
    expect(stageBlocker(checked, "scheduled")).toBeNull();
    expect(stageBlocker(checked, "published")).toMatch(/link bài/);
    expect(stageBlocker({ ...checked, postUrl: "https://x.vn/1" }, "published")).toBeNull();
  });
  it("quá giờ đăng mà chưa đăng thì báo đỏ", () => {
    const now = new Date("2026-10-10T03:00:00Z");
    expect(isOverdue({ publishAt: "2026-10-10T02:00:00Z", status: "scheduled" }, now)).toBe(true);
    expect(isOverdue({ publishAt: "2026-10-10T02:00:00Z", status: "published" }, now)).toBe(false);
    expect(isOverdue({ publishAt: null, status: "idea" }, now)).toBe(false);
  });
});

describe("giờ và tuần theo giờ Việt Nam", () => {
  it("ngày theo giờ VN, tuần bắt đầu Thứ Hai", () => {
    expect(vnDay("2026-10-11T18:00:00Z")).toBe("2026-10-12");
    // 10/10/2026 là Thứ Bảy.
    expect(weekDays(new Date("2026-10-10T03:00:00Z"))).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(weekDays(new Date("2026-10-10T03:00:00Z"), 1)[0]).toBe("2026-10-12");
    // 23:30 Chủ nhật giờ VN vẫn thuộc tuần đó.
    expect(weekDays(new Date("2026-10-11T16:30:00Z"))[6]).toBe("2026-10-11");
  });
  it("bài nhắm khách ở Hàn kèm giờ Hàn", () => {
    expect(publishTimeLabel("2026-10-12T12:00:00Z", "KR")).toBe("19:00 (Hàn 21:00)");
    expect(publishTimeLabel("2026-10-12T12:00:00Z", "VN")).toBe("19:00");
  });
  it("sắp thứ tự trong cột", () => {
    const mk = (id: string, status: ContentItem["status"], position: number) =>
      ({ id, status, position }) as ContentItem;
    expect(
      columnItems([mk("a", "idea", 2), mk("b", "idea", 1.5), mk("c", "review", 1)], "idea").map((i) => i.id),
    ).toEqual(["b", "a"]);
  });
});

describe("kiểm dữ liệu bài", () => {
  it("bắt buộc tiêu đề, kênh, dạng; link phải https", () => {
    expect(contentSchema.safeParse({ title: "A", channel: "tiktok", format: "post" }).success).toBe(true);
    expect(contentSchema.safeParse({ title: " ", channel: "tiktok", format: "post" }).success).toBe(false);
    expect(contentSchema.safeParse({ title: "A", channel: "x", format: "post" }).success).toBe(false);
    expect(
      contentSchema.safeParse({ title: "A", channel: "tiktok", format: "post", postUrl: "http://x" }).success,
    ).toBe(false);
    expect(
      contentSchema.safeParse({
        title: "A",
        channel: "tiktok",
        format: "post",
        publishAt: "2026-10-20T19:00:00+07:00",
      }).success,
    ).toBe(true);
  });
});
