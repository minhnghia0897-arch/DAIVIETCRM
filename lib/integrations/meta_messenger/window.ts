// Khung nhắn tin Messenger (docs/integrations/meta_messenger.md): 24 giờ sau tin cuối của khách gửi tự do; sau đó tới
// 7 ngày chỉ nhân viên trả lời tay bằng thẻ Human Agent; quá 7 ngày không nhắn được. Server kiểm lại ở
// queue_messenger_reply(); hàm này chỉ để giao diện hiện đồng hồ.

const H = 3_600_000;

export type ReplyWindow =
  { mode: "response"; endsAt: Date } | { mode: "human_agent"; endsAt: Date } | { mode: "closed" };

export function replyWindow(lastInboundAt: string | Date | null | undefined, now: Date): ReplyWindow {
  if (!lastInboundAt) return { mode: "closed" };
  const last = new Date(lastInboundAt).getTime();
  if (Number.isNaN(last)) return { mode: "closed" };
  const t = now.getTime();
  if (t < last + 24 * H) return { mode: "response", endsAt: new Date(last + 24 * H) };
  if (t < last + 7 * 24 * H) return { mode: "human_agent", endsAt: new Date(last + 7 * 24 * H) };
  return { mode: "closed" };
}

/** "còn 3 giờ 12 phút", "còn 5 ngày" — làm tròn xuống, không bao giờ hứa nhiều hơn thực tế. */
export function timeLeft(endsAt: Date, now: Date): string {
  const ms = endsAt.getTime() - now.getTime();
  if (ms <= 0) return "đã hết";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `còn ${min} phút`;
  const h = Math.floor(min / 60);
  if (h < 24) return `còn ${h} giờ${min % 60 ? ` ${min % 60} phút` : ""}`;
  return `còn ${Math.floor(h / 24)} ngày`;
}
