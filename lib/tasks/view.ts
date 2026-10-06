// Việc cần làm (CLAUDE.md mục 4): phần thuần dùng chung cho màn Việc bản thật — nhóm theo hạn, viết hạn theo giờ VN.
// Hàm nhận thời điểm từ ngoài, không đọc giờ máy, để kiểm thử và để server với trình duyệt ra cùng một kết quả.

const VN_TZ = "Asia/Ho_Chi_Minh";

export type DueGroup = "overdue" | "today" | "later";

/** yyyy-mm-dd theo giờ VN. */
const vnDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ }).format(d);

/** Việc quá hạn, còn trong hôm nay (giờ VN), hay để ngày sau. */
export function dueGroup(dueAt: string | Date, now: Date): DueGroup {
  const due = new Date(dueAt);
  if (due.getTime() < now.getTime()) return "overdue";
  return vnDay(due) === vnDay(now) ? "today" : "later";
}

/** Hạn viết ngắn: "14:30" nếu trong hôm nay, "Mai 09:00", còn lại "12/10 09:00". */
export function formatDue(dueAt: string | Date, now: Date): string {
  const due = new Date(dueAt);
  const hhmm = new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(due);
  const day = vnDay(due);
  if (day === vnDay(now)) return hhmm;
  const tomorrow = vnDay(new Date(now.getTime() + 24 * 3600_000));
  if (day === tomorrow) return `Mai ${hhmm}`;
  return `${day.slice(8, 10)}/${day.slice(5, 7)} ${hhmm}`;
}

export const APPROVAL_TYPE_LABEL: Record<string, string> = {
  discount: "Duyệt giảm giá",
  payment_confirm: "Xác nhận tiền",
  stock_count: "Duyệt kiểm kê",
  ai_proposal: "Đề xuất của AI",
};
