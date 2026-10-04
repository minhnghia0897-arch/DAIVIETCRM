// Định dạng theo DESIGN.md mục 9: ngày dd/MM/yyyy, giờ 24h, giờ VN.
const VN_TZ = "Asia/Ho_Chi_Minh";

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const date = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: VN_TZ,
  }).format(d);
  const time = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: VN_TZ,
  }).format(d);
  return `${time} ${date}`;
}

/** Cuối ngày hôm nay theo giờ VN, không phụ thuộc múi giờ của máy chủ. */
export function vnEndOfToday(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(now); // yyyy-mm-dd
  return new Date(`${ymd}T23:59:59.999+07:00`);
}

/** Tiền chi tiết: 79.900.000đ */
export function formatMoney(v: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(v)}đ`;
}

/** Tiền trong bảng, thẻ: 79,9tr; 1,21 tỷ */
export function formatMoneyShort(v: number): string {
  if (Math.abs(v) >= 1_000_000_000) {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(v / 1_000_000_000)} tỷ`;
  }
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(v / 1_000_000)}tr`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: VN_TZ,
  }).format(new Date(iso));
}

export function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}
