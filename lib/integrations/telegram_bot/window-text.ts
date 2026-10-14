// Không phụ thuộc gì để dùng chung cho tin báo (outbound.ts) và lệnh xem nhanh (commands.ts), kể cả khi chạy bằng
// script Node hay Edge Function.

/**
 * Khung gọi tốt của một thị trường, viết thành một dòng đọc là hiểu:
 * "T2–T6 19:00–22:30 · cuối tuần 09:00–22:30 (giờ Hàn Quốc)".
 * Ngày trong tuần theo quy ước của bảng markets: 1 = Thứ Hai … 7 = Chủ nhật.
 */
export function windowText(name: string | null, raw: unknown): string | undefined {
  if (!Array.isArray(raw) || !name) return undefined;
  const parts: string[] = [];
  for (const w of raw as { start?: string; end?: string; days?: number[] }[]) {
    if (!w?.start || !w?.end) continue;
    const days = Array.isArray(w.days) ? w.days : [];
    const weekendOnly = days.length > 0 && days.every((d) => d >= 6);
    const everyDay = days.length >= 7;
    const when = everyDay ? "" : weekendOnly ? "cuối tuần " : days.length ? "T2–T6 " : "";
    parts.push(`${when}${w.start}–${w.end}`);
  }
  return parts.length ? `${parts.join(" · ")} (giờ ${name})` : undefined;
}
