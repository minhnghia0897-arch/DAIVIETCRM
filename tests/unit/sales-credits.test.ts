import { describe, expect, it } from "vitest";

import { isLiveScreen } from "@/lib/nav";
import {
  currentMonth,
  monthLabel,
  orderSalesValue,
  parseMillions,
  parseMonth,
  salesProgress,
  shiftMonth,
  teamTotals,
  toMillions,
} from "@/lib/sales/credits";

describe("kỳ tháng của doanh số", () => {
  it("tháng hiện tại theo giờ VN, kể cả lúc máy chủ còn ở tháng trước theo UTC", () => {
    // 31/10 23:30 UTC là 01/11 06:30 giờ VN.
    expect(currentMonth(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
    expect(currentMonth(new Date("2026-10-15T03:00:00Z"))).toBe("2026-10-01");
  });

  it("đọc ?thang= đúng dạng, sai dạng thì về tháng hiện tại", () => {
    const now = new Date("2026-10-15T03:00:00Z");
    expect(parseMonth("2026-09", now)).toBe("2026-09-01");
    expect(parseMonth(["2025-12"], now)).toBe("2025-12-01");
    expect(parseMonth("2026-13", now)).toBe("2026-10-01");
    expect(parseMonth("09-2026", now)).toBe("2026-10-01");
    expect(parseMonth(undefined, now)).toBe("2026-10-01");
  });

  it("lùi, tiến tháng qua năm", () => {
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-10-01", -5)).toBe("2026-05-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-03-01", -15)).toBe("2024-12-01");
    expect(monthLabel("2026-10-01")).toBe("Tháng 10/2026");
  });
});

describe("doanh số so với chỉ tiêu", () => {
  it("doanh số một đơn là tiền hàng sau giảm, không âm", () => {
    expect(orderSalesValue(50_000_000, 2_000_000)).toBe(48_000_000);
    expect(orderSalesValue(1_000_000, 2_000_000)).toBe(0);
  });

  it("tỷ lệ đạt và còn thiếu", () => {
    expect(salesProgress(48_000_000, 100_000_000)).toEqual({ ratio: 0.48, remaining: 52_000_000 });
    expect(salesProgress(120_000_000, 100_000_000)).toEqual({ ratio: 1.2, remaining: 0 });
    // Tháng chỉ có dòng trừ (hủy đơn tháng trước): không âm tỷ lệ.
    expect(salesProgress(-30_000_000, 100_000_000).ratio).toBe(0);
    expect(salesProgress(48_000_000, null)).toEqual({ ratio: null, remaining: 0 });
  });

  it("cộng cả đội", () => {
    const row = (net: number, target: number | null, reversed = 0) => ({
      user_id: "u",
      full_name: "A",
      sold: net - reversed,
      reversed,
      net,
      orders: 1,
      target,
    });
    expect(teamTotals([row(48e6, 100e6), row(-30e6, null, -30e6)])).toEqual({
      net: 18e6,
      reversed: -30e6,
      orders: 2,
      target: 100e6,
    });
  });

  it("ô nhập chỉ tiêu theo triệu", () => {
    expect(parseMillions("150")).toBe(150_000_000);
    expect(parseMillions("150,5")).toBe(150_500_000);
    expect(parseMillions(" 1 200 ")).toBe(1_200_000_000);
    expect(parseMillions("")).toBe(0);
    expect(parseMillions("abc")).toBeNull();
    expect(parseMillions("-5")).toBeNull();
    expect(toMillions(150_500_000)).toBe("150,5");
    expect(toMillions(null)).toBe("");
  });
});

describe("nhãn mô phỏng ở Đội ngũ", () => {
  it("tổng quan, hiệu suất, chỉ tiêu là dữ liệu thật; kèm cặp, bàn giao còn mô phỏng", () => {
    expect(isLiveScreen("/team")).toBe(true);
    expect(isLiveScreen("/team/people/abc")).toBe(true);
    expect(isLiveScreen("/team/targets")).toBe(true);
    expect(isLiveScreen("/team/coaching")).toBe(false);
    expect(isLiveScreen("/team/offboarding")).toBe(false);
  });
});
