import { z } from "zod";

// Gọi Telegram Bot API (đã kiểm theo tài liệu chính thức, docs/integrations/telegram_bot.md). Không thêm thư viện.
// Token không bao giờ ghi vào log hay thông báo lỗi.

const BASE = "https://api.telegram.org";

export class TelegramError extends Error {
  readonly method: string;
  readonly code: number;
  constructor(method: string, code: number, description: string) {
    super(`Telegram ${method} lỗi ${code}: ${description}`);
    this.method = method;
    this.code = code;
  }
}

const envelope = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
  description: z.string().optional(),
  error_code: z.number().optional(),
});

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramApi {
  call<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T>;
  downloadFile(filePath: string): Promise<ArrayBuffer>;
}

export function telegramApi(token: string, fetchImpl: typeof fetch = fetch): TelegramApi {
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error("Token bot Telegram không đúng định dạng");
  return {
    async call<T>(method: string, body: Record<string, unknown> = {}) {
      const res = await fetchImpl(`${BASE}/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = envelope.parse(await res.json());
      if (!json.ok) throw new TelegramError(method, json.error_code ?? res.status, json.description ?? "");
      return json.result as T;
    },
    async downloadFile(filePath: string) {
      // Link tải: https://api.telegram.org/file/bot<token>/<file_path>, tối đa 20MB, còn hạn ít nhất 1 giờ.
      const res = await fetchImpl(`${BASE}/file/bot${token}/${filePath}`);
      if (!res.ok) throw new TelegramError("file", res.status, "không tải được tệp");
      return res.arrayBuffer();
    },
  };
}

// --- Kiểu dữ liệu nhận về (chỉ các trường bot dùng) ---

export const tgUser = z.object({
  id: z.number(),
  is_bot: z.boolean().optional(),
  username: z.string().optional(),
});
export const tgChat = z.object({ id: z.number(), type: z.string(), title: z.string().optional() });
export const tgPhoto = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  file_size: z.number().optional(),
});

const baseMessage = z.object({
  message_id: z.number(),
  from: tgUser.optional(),
  chat: tgChat,
  text: z.string().optional(),
  caption: z.string().optional(),
  photo: z.array(tgPhoto).optional(),
  migrate_to_chat_id: z.number().optional(),
});

export const tgMessage = baseMessage.extend({ reply_to_message: baseMessage.optional() });
export type TgMessage = z.infer<typeof tgMessage>;

export const tgUpdate = z.object({
  update_id: z.number(),
  message: tgMessage.optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: tgUser,
      data: z.string().optional(),
      message: z.object({ message_id: z.number(), chat: tgChat }).optional(),
    })
    .optional(),
  my_chat_member: z
    .object({
      chat: tgChat,
      from: tgUser,
      new_chat_member: z.object({ status: z.string() }),
    })
    .optional(),
});
export type TgUpdate = z.infer<typeof tgUpdate>;
