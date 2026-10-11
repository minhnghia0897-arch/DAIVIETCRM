import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

// Đọc webhook Messenger (docs/integrations/meta_messenger.md). Hàm thuần, không ghi log nội dung tin hay PSID.
//
// Meta gửi { object: "page", entry: [{ id: <Page ID>, time, messaging: [<một sự kiện>] }] } và ký thân yêu cầu bằng
// HMAC-SHA256 với App Secret trong header X-Hub-Signature-256 ("sha256=<hex>").

/**
 * Chuỗi Meta thực sự ký: theo tài liệu Meta, chữ ký tính trên bản thân yêu cầu đã đổi mọi ký tự ngoài ASCII sang
 * dạng \uXXXX (hex chữ thường), ví dụ "äöå" thành "\u00e4\u00f6\u00e5". Thân nhận được có thể chứa chữ có dấu
 * nguyên văn (tin tiếng Việt, tên người), nên phải đổi lại trước khi tính.
 */
export function metaSignedForm(rawBody: string): string {
  return rawBody.replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** Kiểm chữ ký trên đúng chuỗi Meta gửi (không parse lại JSON), và trên bản ký tự có dấu đã đổi sang \uXXXX. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const given = header.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const givenBuf = Buffer.from(given.toLowerCase(), "hex");
  const forms = [rawBody];
  if (/[^\x00-\x7f]/.test(rawBody)) forms.push(metaSignedForm(rawBody));
  return forms.some((body) =>
    timingSafeEqual(
      givenBuf,
      Buffer.from(createHmac("sha256", appSecret).update(body, "utf8").digest("hex"), "hex"),
    ),
  );
}

const item = z
  .object({
    sender: z.object({ id: z.string() }),
    recipient: z.object({ id: z.string() }),
    timestamp: z.number().optional(),
    message: z
      .object({
        mid: z.string(),
        text: z.string().optional(),
        is_echo: z.boolean().optional(),
        metadata: z.string().optional(),
        attachments: z.array(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    postback: z
      .object({ mid: z.string().optional(), title: z.string().optional(), payload: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const body = z.object({
  object: z.string(),
  entry: z.array(
    z
      .object({ id: z.string(), time: z.number().optional(), messaging: z.array(z.unknown()).optional() })
      .passthrough(),
  ),
});

export interface MessengerItem {
  pageId: string;
  /** Mã chống trùng trong webhook_events: mã tin của Meta. */
  externalId: string;
  eventType: "message" | "message_echo" | "postback";
  item: z.infer<typeof item>;
  /** Tin đọc lại qua Graph API vì webhook bị lỡ (không có thì là tin webhook). */
  via?: "reconcile";
}

/**
 * Tách các tin cần lưu. Bỏ qua sự kiện đã đọc, đã nhận, phản ứng… (CRM chưa dùng). Tin không đúng dạng cũng bỏ qua,
 * không làm hỏng cả lô. Trả null khi không phải webhook của Page.
 */
export function parseMessengerWebhook(json: unknown): MessengerItem[] | null {
  const parsed = body.safeParse(json);
  if (!parsed.success || parsed.data.object !== "page") return null;
  const out: MessengerItem[] = [];
  for (const entry of parsed.data.entry) {
    for (const raw of entry.messaging ?? []) {
      const r = item.safeParse(raw);
      if (!r.success) continue;
      const it = r.data;
      if (it.message) {
        out.push({
          pageId: entry.id,
          externalId: it.message.mid,
          eventType: it.message.is_echo ? "message_echo" : "message",
          item: it,
        });
      } else if (it.postback) {
        // Nút "Bắt đầu" và nút bấm: có mid thì dùng, không thì ghép người gửi và thời điểm.
        out.push({
          pageId: entry.id,
          externalId: it.postback.mid ?? `postback:${it.sender.id}:${it.timestamp ?? entry.time ?? 0}`,
          eventType: "postback",
          item: it,
        });
      }
    }
  }
  return out;
}

/**
 * Tóm tắt an toàn của một webhook (loại sự kiện, có phải bản sao tin của Page, ứng dụng gửi) để ghi kèm khi chữ ký
 * sai: không có nội dung tin, không có PSID.
 */
export function webhookShape(json: unknown): { kinds: string[]; echo: boolean; appIds: string[] } {
  const kinds = new Set<string>();
  const appIds = new Set<string>();
  let echo = false;
  const entries = (json as { entry?: { messaging?: Record<string, unknown>[] }[] } | null)?.entry;
  for (const e of Array.isArray(entries) ? entries : []) {
    for (const m of Array.isArray(e?.messaging) ? e.messaging : []) {
      for (const k of ["message", "postback", "read", "delivery", "reaction", "referral", "optin"])
        if (m && k in m) kinds.add(k);
      const msg = m?.message as { is_echo?: boolean; app_id?: number | string } | undefined;
      if (msg?.is_echo) echo = true;
      if (msg?.app_id !== undefined) appIds.add(String(msg.app_id));
    }
  }
  return { kinds: [...kinds], echo, appIds: [...appIds] };
}

/** Page ID đầu tiên trong thân webhook, để tìm App Secret của showroom trước khi kiểm chữ ký. */
export function firstPageId(json: unknown): string | null {
  const parsed = body.safeParse(json);
  return parsed.success ? (parsed.data.entry[0]?.id ?? null) : null;
}
