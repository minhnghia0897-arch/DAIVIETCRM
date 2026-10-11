// Mốc "hôm nay" cố định cho dữ liệu mô phỏng, để nhãn hạn việc và chỉ số ổn định giữa các lần xem.
export const DEMO_TODAY = "2026-10-04";

export function dueLabel(due: string, today = DEMO_TODAY): { label: string; overdue: boolean } {
  const d = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
  if (d < 0) return { label: `Quá ${-d} ngày`, overdue: true };
  if (d === 0) return { label: "Hạn hôm nay", overdue: false };
  return { label: `Còn ${d} ngày`, overdue: false };
}
