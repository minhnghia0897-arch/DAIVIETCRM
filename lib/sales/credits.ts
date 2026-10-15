// Doanh số từng sale (Owner chốt 15/10/2026; migration 20261015000100_sales_credits.sql). Sổ doanh số và cách tính
// nằm ở database; ở đây chỉ là hàm thuần cho kỳ tháng và tiến độ so với chỉ tiêu, dùng chung cho các màn Đội ngũ,
// Trang chủ và hồ sơ đơn.

const VN_TZ = "Asia/Ho_Chi_Minh";
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Đầu tháng hiện tại theo giờ VN, dạng yyyy-mm-01. */
export function currentMonth(now: Date = new Date()): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(now);
  return `${ymd.slice(0, 7)}-01`;
}

/** Đọc tham số ?thang=yyyy-mm; sai dạng hoặc không có thì lấy tháng hiện tại. */
export function parseMonth(value: string | string[] | undefined, now: Date = new Date()): string {
  const v = Array.isArray(value) ? value[0] : value;
  const m = v ? MONTH_RE.exec(v) : null;
  return m ? `${m[1]}-${m[2]}-01` : currentMonth(now);
}

/** Lùi, tiến n tháng: shiftMonth("2026-01-01", -1) = "2025-12-01". */
export function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
}

/** Giá trị cho ?thang=: "2026-10". */
export const monthParam = (month: string) => month.slice(0, 7);

/** "Tháng 10/2026". */
export function monthLabel(month: string): string {
  return `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`;
}

/** "10/2026" cho dòng phụ. */
export function monthShort(month: string): string {
  return `${month.slice(5, 7)}/${month.slice(0, 4)}`;
}

export interface SalesProgress {
  /** Tỷ lệ đạt so với chỉ tiêu (null khi chưa đặt chỉ tiêu). */
  ratio: number | null;
  /** Còn thiếu để đạt chỉ tiêu (0 khi đã đạt hoặc chưa đặt). */
  remaining: number;
}

export function salesProgress(net: number, target: number | null | undefined): SalesProgress {
  if (!target || target <= 0) return { ratio: null, remaining: 0 };
  return { ratio: Math.max(0, net) / target, remaining: Math.max(0, target - net) };
}

/** Doanh số một đơn sẽ được tính: tiền hàng sau giảm, không gồm phí giao, phí lắp. */
export function orderSalesValue(subtotal: number, discount: number): number {
  return Math.max(0, subtotal - discount);
}

/** Trạng thái đơn đã được tính doanh số (khách cọc xong hoặc đi thẳng các bước sau). */
export const CREDITED_STATUSES = ["deposit_paid", "ready_to_ship", "delivering", "installed", "completed"];

export interface KpiRow {
  user_id: string;
  full_name: string;
  sold: number;
  reversed: number;
  net: number;
  orders: number;
  target: number | null;
}

/** Tổng cả đội từ các dòng KPI tháng. */
export function teamTotals(rows: KpiRow[]) {
  return rows.reduce(
    (s, r) => ({
      net: s.net + r.net,
      reversed: s.reversed + r.reversed,
      orders: s.orders + r.orders,
      target: s.target + (r.target ?? 0),
    }),
    { net: 0, reversed: 0, orders: 0, target: 0 },
  );
}

/** Ô nhập chỉ tiêu theo triệu đồng: "150" hoặc "150,5" thành đồng; để trống là 0; sai dạng là null. */
export function parseMillions(v: string): number | null {
  const s = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return 0;
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  return Math.round(Number(s) * 1_000_000);
}

/** Đồng sang chữ triệu để điền lại ô nhập: 150500000 thành "150,5". */
export const toMillions = (v: number | null) => (v ? String(v / 1_000_000).replace(".", ",") : "");
