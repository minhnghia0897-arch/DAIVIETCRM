import { describe, expect, it } from "vitest";

import { checkSession, formatMinutes, vnToday } from "@/lib/team/attendance";

const SHIFTS = [
  { name: "Ca ngày", days: [1, 2, 3, 4, 5, 6], start: "08:30", end: "17:30" },
  { name: "Ca tối", days: [1, 2, 3, 4, 5, 6], start: "16:30", end: "21:00" },
  { name: "Ca Chủ nhật", days: [7], start: "09:00", end: "17:00" },
];
// Thứ Tư 07/10/2026, giờ VN = UTC+7.
const at = (hhmm: string, day = "2026-10-07") => new Date(`${day}T${hhmm}:00+07:00`);

describe("so khớp phiên trực với ca", () => {
  it("vào trễ 20 phút, tắt sớm 30 phút ở ca ngày", () => {
    const r = checkSession({ startedAt: at("08:50"), endedAt: at("17:00") }, SHIFTS, at("18:00"));
    expect(r.shift?.name).toBe("Ca ngày");
    expect(r.lateMin).toBe(20);
    expect(r.earlyMin).toBe(30);
    expect(r.workedMin).toBe(490);
  });

  it("trễ dưới 5 phút coi như đúng giờ", () => {
    const r = checkSession({ startedAt: at("08:33"), endedAt: null }, SHIFTS, at("10:00"));
    expect(r.lateMin).toBe(0);
    expect(r.earlyMin).toBe(0);
    expect(r.workedMin).toBe(87);
  });

  it("bật trực lúc 16:40 khớp ca tối, không phải ca ngày", () => {
    const r = checkSession({ startedAt: at("16:40"), endedAt: at("21:00") }, SHIFTS, at("22:00"));
    expect(r.shift?.name).toBe("Ca tối");
    expect(r.lateMin).toBe(10);
  });

  it("Chủ nhật dùng ca Chủ nhật; ngày không có ca thì là trực ngoài ca", () => {
    expect(
      checkSession({ startedAt: at("09:00", "2026-10-11"), endedAt: null }, SHIFTS, at("10:00", "2026-10-11"))
        .shift?.name,
    ).toBe("Ca Chủ nhật");
    expect(checkSession({ startedAt: at("09:00"), endedAt: null }, [], at("10:00")).shift).toBeNull();
  });

  it("định dạng phút và ngày VN", () => {
    expect(formatMinutes(125)).toBe("2 giờ 05 phút");
    expect(formatMinutes(45)).toBe("45 phút");
    expect(vnToday(new Date("2026-10-07T18:30:00Z"))).toBe("2026-10-08");
  });
});
