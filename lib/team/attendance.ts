import { TZDate } from "@date-fns/tz";

// So khớp phiên trực với ca đã xếp (CLAUDE.md mục 9.2): vào trực trễ, tắt trực sớm, giờ trực thực tế. Chấm công
// nhẹ để quản lý nhìn, không dùng tính lương. Hàm thuần: nhận thời điểm từ ngoài, không đọc giờ máy.

export const VN_TZ = "Asia/Ho_Chi_Minh";
/** Trễ hoặc sớm dưới mức này thì coi như đúng giờ. */
export const GRACE_MIN = 5;

export interface ShiftDef {
  name: string;
  /** ISO: 1 = thứ Hai … 7 = Chủ nhật. */
  days: number[];
  /** "HH:mm" giờ VN. */
  start: string;
  end: string;
}

export interface SessionCheck {
  shift: { name: string; start: Date; end: Date } | null;
  /** Số phút vào trễ so với đầu ca (0 nếu đúng giờ hoặc không có ca). */
  lateMin: number;
  /** Số phút tắt sớm so với cuối ca (0 nếu đúng giờ, chưa tắt, hoặc không có ca). */
  earlyMin: number;
  /** Số phút trực thực tế tính tới `now` nếu phiên còn mở. */
  workedMin: number;
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function shiftsOn(day: TZDate, shifts: ShiftDef[]) {
  const iso = day.getDay() === 0 ? 7 : day.getDay();
  return shifts
    .filter((s) => s.days.includes(iso))
    .map((s) => ({
      name: s.name,
      start: new Date(
        new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), 0, toMin(s.start), 0, VN_TZ).getTime(),
      ),
      end: new Date(
        new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), 0, toMin(s.end), 0, VN_TZ).getTime(),
      ),
    }));
}

/**
 * Ca ứng với một phiên: trong các ca cùng ngày (giờ VN) chưa kết thúc lúc bật trực, ca có giờ bắt đầu gần giờ bật
 * nhất (bật 16:40 khớp ca tối 16:30, không phải ca ngày đang chạy tới 17:30). Không còn ca nào thì lấy ca bắt đầu
 * gần nhất trong ngày. Ngày không có ca thì `shift = null` (trực ngoài ca).
 */
export function checkSession(
  session: { startedAt: Date; endedAt: Date | null },
  shifts: ShiftDef[],
  now: Date,
): SessionCheck {
  const t = new TZDate(session.startedAt, VN_TZ);
  const day = new TZDate(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0, VN_TZ);
  const end = session.endedAt ?? now;
  const workedMin = Math.max(0, Math.round((+end - +session.startedAt) / 60000));
  const candidates = shiftsOn(day, shifts);
  if (!candidates.length) return { shift: null, lateMin: 0, earlyMin: 0, workedMin };
  const dist = (c: { start: Date }) => Math.abs(+session.startedAt - +c.start);
  const open = candidates.filter((c) => +c.end > +session.startedAt);
  const shift = (open.length ? open : candidates).reduce((a, b) => (dist(b) < dist(a) ? b : a));
  const late = Math.round((+session.startedAt - +shift.start) / 60000);
  const early = session.endedAt ? Math.round((+shift.end - +session.endedAt) / 60000) : 0;
  return {
    shift,
    lateMin: late > GRACE_MIN ? late : 0,
    earlyMin: early > GRACE_MIN ? early : 0,
    workedMin,
  };
}

/** "2 giờ 05 phút", "45 phút". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} giờ ${String(m).padStart(2, "0")} phút` : `${m} phút`;
}

/** Ngày hôm nay theo giờ VN, dạng YYYY-MM-DD. */
export function vnToday(now: Date): string {
  const t = new TZDate(now, VN_TZ);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** Đầu ngày hôm nay theo giờ VN (thời điểm tuyệt đối). */
export function vnStartOfToday(now: Date): Date {
  const t = new TZDate(now, VN_TZ);
  return new Date(new TZDate(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0, VN_TZ).getTime());
}
