// Việc nền đẩy tin Telegram, bản Edge Function. Bản thật đang chạy qua route /api/cron/telegram-outbound của CRM
// (migration 20261013000200, như Messenger, Zalo); giữ bản này cho môi trường muốn chạy hẳn trên Supabase. Hàm quét dữ liệu mới trong CRM — lead được giao,
// hẹn gọi lại tới giờ, việc chờ duyệt — rồi gửi tin cho đúng người đã liên kết Telegram. Nghiệp vụ dùng chung với
// bản chạy thử ở scripts/telegram-bot.mts: cùng lib/integrations/telegram_bot/outbound.ts.
//
// Con trỏ quét nằm ở bảng telegram_outbound_state nên lần chạy sau tiếp đúng chỗ lần trước dừng, không gửi trùng.
// Không ghi token, số điện thoại hay nội dung tin của khách ra log.

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../../lib/db/types.ts";
import { telegramApi } from "../../../lib/integrations/telegram_bot/api.ts";
import { telegramConfig } from "../../../lib/integrations/telegram_bot/config.ts";
import { runTelegramOutbound } from "../../../lib/integrations/telegram_bot/outbound.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async () => {
  const db = createClient<Database>(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const cfg = await telegramConfig(db);
  if (!cfg?.token) return json({ skipped: "chưa cấu hình bot Telegram" });
  try {
    return json(await runTelegramOutbound(db, cfg, telegramApi(cfg.token)));
  } catch {
    return json({ error: "không lưu được con trỏ quét" }, 500);
  }
});
