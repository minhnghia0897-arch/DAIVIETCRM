import { timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/db/admin";
import { telegramApi } from "@/lib/integrations/telegram_bot/api";
import { telegramConfig } from "@/lib/integrations/telegram_bot/config";
import { handleUpdate } from "@/lib/integrations/telegram_bot/inbound";

// Telegram gửi tin về đây (CLAUDE.md mục 10.1: lưu thô trước, trả 200 nhanh, chống xử lý trùng theo update_id —
// handleUpdate() lo cả ba). Telegram gửi lại khi phản hồi không phải 2XX, nên chỉ trả lỗi khi thật sự chưa nhận được.
//
// Mã bí mật webhook do Owner đặt ở Cài đặt → Tích hợp, Telegram gửi kèm mỗi lần gọi trong header
// X-Telegram-Bot-Api-Secret-Token. Sai mã thì không đọc nội dung, không ghi vào database.
// Không bao giờ ghi token, mã bí mật, số điện thoại hay nội dung tin của khách ra log.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** So sánh không lộ độ dài khớp qua thời gian chạy. */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Tên bot chỉ đổi khi Owner đổi bot, hỏi Telegram một lần cho mỗi tiến trình là đủ. */
let cachedBotUsername: string | null = null;

export async function POST(req: Request) {
  const admin = createAdminClient();
  const cfg = await telegramConfig(admin);
  if (!cfg?.token || !cfg.webhookSecret) {
    // Chưa cấu hình: báo để Telegram gửi lại sau, không mất tin.
    return new Response("telegram chưa được cấu hình", { status: 503 });
  }
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token") ?? "", cfg.webhookSecret)) {
    return new Response("sai mã bí mật", { status: 401 });
  }

  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return new Response("nội dung không phải JSON", { status: 400 });
  }

  const api = telegramApi(cfg.token);
  cachedBotUsername ??= cfg.botUsername ?? (await api.call<{ username: string }>("getMe")).username;
  await handleUpdate(admin, api, cachedBotUsername, update);
  return new Response(null, { status: 200 });
}
