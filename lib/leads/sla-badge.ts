import { localTime } from "./windows";

// Nhãn hạn gọi của một lead trên danh sách và bảng Kanban (CLAUDE.md mục 7): chờ khung gọi của thị trường khách, đã
// liên hệ, chưa phân, còn bao nhiêu phút hoặc quá bao nhiêu phút. Hàm thuần: nhận thời điểm từ ngoài.

export type SlaTone = "n" | "warn" | "err" | "ok" | "ai";

export function slaBadge(
  l: {
    stage: string;
    window_wait_until: string | null;
    first_contact_at: string | null;
    assigned_to: string | null;
    sla_due_at: string | null;
  },
  market: { country_code: string; name: string; timezone: string } | undefined,
  now: Date,
): { tone: SlaTone; text: string } | null {
  if (l.stage === "won" || l.stage === "lost") return null;
  if (l.window_wait_until && new Date(l.window_wait_until) > now)
    return {
      tone: "ai",
      text: `Gọi lúc ${localTime(new Date(l.window_wait_until), market?.timezone ?? "Asia/Ho_Chi_Minh")}${market && market.country_code !== "VN" ? ` giờ ${market.name}` : ""}`,
    };
  if (l.first_contact_at) return { tone: "ok", text: "Đã liên hệ" };
  if (!l.assigned_to) return { tone: "warn", text: "Chưa phân" };
  if (!l.sla_due_at) return null;
  const mins = Math.round((new Date(l.sla_due_at).getTime() - now.getTime()) / 60_000);
  return mins < 0
    ? { tone: "err", text: `Quá ${-mins} phút` }
    : { tone: mins < 2 ? "warn" : "n", text: `Còn ${mins} phút` };
}

/** Nhãn trên bảng theo giai đoạn: cột đã cho biết giai đoạn nên bỏ nhãn "Đã liên hệ", chỉ nhắc khi còn phải gọi. */
export function boardSlaBadge(...args: Parameters<typeof slaBadge>): ReturnType<typeof slaBadge> {
  const badge = slaBadge(...args);
  return badge?.tone === "ok" ? null : badge;
}
