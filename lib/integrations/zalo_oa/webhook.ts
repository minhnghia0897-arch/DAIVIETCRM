import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

// Đọc webhook Zalo OA (docs/integrations/zalo_oa.md). Hàm thuần, không ghi log nội dung tin hay mã người dùng.
//
// Zalo ký mỗi yêu cầu trong header X-ZEvent-Signature: mac = sha256(appId + data + timeStamp + OAsecretKey), data là
// thân yêu cầu nguyên văn, timeStamp là trường `timestamp` trong thân. Header có thể có tiền tố "mac=".

export function verifyZaloSignature(
  rawBody: string,
  header: string | null,
  appId: string,
  oaSecretKey: string,
  timestamp: string,
): boolean {
  if (!header || !appId || !oaSecretKey || !timestamp) return false;
  const given = header.trim().replace(/^mac=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const expected = createHash("sha256")
    .update(`${appId}${rawBody}${timestamp}${oaSecretKey}`, "utf8")
    .digest("hex");
  return timingSafeEqual(Buffer.from(given.toLowerCase(), "hex"), Buffer.from(expected, "hex"));
}

const event = z
  .object({
    app_id: z.string().optional(),
    event_name: z.string(),
    timestamp: z.union([z.string(), z.number()]).transform(String),
    sender: z.object({ id: z.string() }).passthrough().optional(),
    recipient: z.object({ id: z.string() }).passthrough().optional(),
    message: z.object({ msg_id: z.string().optional() }).passthrough().optional(),
    info: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type ZaloEvent = z.infer<typeof event>;

/** Sự kiện CRM lưu lại: tin khách gửi, tin OA gửi (bản sao), khách gửi form thông tin. */
export function isUsedZaloEvent(name: string): boolean {
  return name.startsWith("user_send_") || name.startsWith("oa_send_") || name === "user_submit_info";
}

export function parseZaloWebhook(json: unknown): ZaloEvent | null {
  const r = event.safeParse(json);
  return r.success ? r.data : null;
}

/** ID OA trong sự kiện: OA là người nhận khi khách gửi, là người gửi khi OA gửi. */
export function oaIdOf(e: ZaloEvent): string | null {
  return (e.event_name.startsWith("oa_send_") ? e.sender?.id : e.recipient?.id) ?? null;
}

/** Mã chống trùng trong webhook_events: mã tin của Zalo; sự kiện không có mã tin thì ghép tên, người, thời điểm. */
export function zaloExternalId(e: ZaloEvent): string {
  return e.message?.msg_id ?? `${e.event_name}:${e.sender?.id ?? ""}:${e.timestamp}`;
}
