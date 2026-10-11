import { TZDate } from "@date-fns/tz";

import { localTime, nextWindowStart, type MarketWindows } from "./windows.ts";

// Gợi ý giờ hẹn gọi lại luôn nằm trong khung gọi của thị trường khách (CLAUDE.md mục 7). Hàm thuần: nhận thời điểm
// từ ngoài để server và kiểm thử ra cùng kết quả.

/**
 * Bảng markets lưu khung theo dạng [{days: [1..7], start, end}] với 1 = Thứ Hai … 7 = Chủ nhật;
 * lib/leads/windows dùng 0 = Chủ nhật … 6 = Thứ Bảy. Đổi một lần ở đây.
 */
export function marketWindowsFromDb(timezone: string, raw: unknown): MarketWindows {
  const windows: MarketWindows["windows"] = {};
  if (Array.isArray(raw)) {
    for (const w of raw as { days?: number[]; start?: string; end?: string }[]) {
      if (!w?.start || !w?.end || !Array.isArray(w.days)) continue;
      for (const d of w.days) {
        const day = d % 7; // 7 (Chủ nhật) → 0
        (windows[day] ??= []).push([w.start, w.end]);
      }
    }
  }
  return { timezone, windows };
}

export interface CallbackSlot {
  /** Thời điểm tuyệt đối, ISO. */
  at: string;
  /** Nhãn theo giờ địa phương của khách: "Hôm nay 19:00", "Mai 09:00", "12/10 19:00". */
  label: string;
}

/** Ba gợi ý: sớm nhất sau 1 giờ nữa, đầu khung ngày mai, đầu khung ngày kia — bỏ trùng. */
export function callbackSlots(now: Date, m: MarketWindows): CallbackSlot[] {
  const startOfLocalDay = (offset: number) => {
    const t = new TZDate(now, m.timezone);
    return new Date(
      new TZDate(t.getFullYear(), t.getMonth(), t.getDate() + offset, 0, 0, 0, m.timezone).getTime(),
    );
  };
  const candidates = [
    nextWindowStart(new Date(now.getTime() + 3600_000), m),
    nextWindowStart(startOfLocalDay(1), m),
    nextWindowStart(startOfLocalDay(2), m),
  ];

  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: m.timezone }).format(d);
  const today = dayKey(now);
  const tomorrow = dayKey(startOfLocalDay(1));

  const seen = new Set<number>();
  const out: CallbackSlot[] = [];
  for (const c of candidates) {
    if (!c || seen.has(c.getTime())) continue;
    seen.add(c.getTime());
    const key = dayKey(c);
    const word =
      key === today ? "Hôm nay" : key === tomorrow ? "Mai" : `${key.slice(8, 10)}/${key.slice(5, 7)}`;
    out.push({ at: c.toISOString(), label: `${word} ${localTime(c, m.timezone)}` });
  }
  return out;
}
