import { TZDate } from "@date-fns/tz";

// Khung gọi theo thị trường của khách (CLAUDE.md mục 7). Khung khai báo theo giờ địa phương của khách,
// theo ngày trong tuần (0 = Chủ nhật … 6 = Thứ Bảy). Hàm thuần: nhận thời điểm từ ngoài, không đọc giờ máy.

export interface MarketWindows {
  timezone: string;
  /** Khung theo ngày trong tuần, giờ địa phương "HH:mm". Ngày không có khung thì không gọi. */
  windows: Partial<Record<number, [string, string][]>>;
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function localDay(at: Date, tz: string, addDays: number) {
  const t = new TZDate(at, tz);
  return new TZDate(t.getFullYear(), t.getMonth(), t.getDate() + addDays, 0, 0, 0, tz);
}

/** Các khung (thời điểm tuyệt đối) của một ngày địa phương. */
function windowsOfDay(day: TZDate, m: MarketWindows): { start: Date; end: Date }[] {
  return (m.windows[day.getDay()] ?? []).map(([s, e]) => {
    const start = new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), 0, toMin(s), 0, m.timezone);
    const end = new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), 0, toMin(e), 0, m.timezone);
    return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
  });
}

export function isInWindow(at: Date, m: MarketWindows): boolean {
  return windowsOfDay(localDay(at, m.timezone, 0), m).some((w) => at >= w.start && at < w.end);
}

/** Thời điểm sớm nhất từ `at` trở đi nằm trong khung gọi; `null` nếu 8 ngày tới không có khung nào. */
export function nextWindowStart(at: Date, m: MarketWindows): Date | null {
  for (let d = 0; d <= 7; d++) {
    for (const w of windowsOfDay(localDay(at, m.timezone, d), m).sort((a, b) => +a.start - +b.start)) {
      if (at < w.end) return at > w.start ? at : w.start;
    }
  }
  return null;
}

/** Nhãn giờ theo giờ địa phương của khách, ví dụ "19:00". */
export function localTime(at: Date, tz: string): string {
  const t = new TZDate(at, tz);
  return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

/** Khung chuẩn: ngày thường một khung, Thứ Bảy và Chủ nhật một khung. */
export function weeklyWindows(
  timezone: string,
  weekday: [string, string],
  weekend: [string, string],
): MarketWindows {
  return {
    timezone,
    windows: {
      0: [weekend],
      1: [weekday],
      2: [weekday],
      3: [weekday],
      4: [weekday],
      5: [weekday],
      6: [weekend],
    },
  };
}
