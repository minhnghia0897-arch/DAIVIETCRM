// Việc nền đẩy tin Telegram (CLAUDE.md mục 3: pg_cron gọi Edge Function, không thêm hạ tầng mới).
// pg_cron gọi hàm này mỗi phút (public.dispatch_telegram_outbound). Hàm quét dữ liệu mới trong CRM — lead được giao,
// hẹn gọi lại tới giờ, việc chờ duyệt — rồi gửi tin cho đúng người đã liên kết Telegram. Nghiệp vụ dùng chung với
// bản chạy thử ở scripts/telegram-bot.mts: cùng lib/integrations/telegram_bot/outbound.ts.
//
// Con trỏ quét nằm ở bảng telegram_outbound_state nên lần chạy sau tiếp đúng chỗ lần trước dừng, không gửi trùng.
// Không ghi token, số điện thoại hay nội dung tin của khách ra log.

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../../lib/db/types.ts";
import { telegramApi } from "../../../lib/integrations/telegram_bot/api.ts";
import { telegramConfig } from "../../../lib/integrations/telegram_bot/config.ts";
import { initialCursor, pollOutbound } from "../../../lib/integrations/telegram_bot/outbound.ts";

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

  // Lần đầu: bắt đầu từ hiện tại, không gửi lại dồn dữ liệu cũ.
  const { data: saved } = await db
    .from("telegram_outbound_state")
    .select("last_event_id, last_task_check, last_approval_at")
    .eq("showroom_id", cfg.showroomId)
    .maybeSingle();
  const cursor = saved
    ? {
        lastEventId: Number(saved.last_event_id),
        lastTaskCheck: saved.last_task_check,
        lastApprovalAt: saved.last_approval_at,
      }
    : await initialCursor(db);

  const next = await pollOutbound(db, telegramApi(cfg.token), cursor);

  const { error } = await db.from("telegram_outbound_state").upsert(
    {
      showroom_id: cfg.showroomId,
      last_event_id: next.lastEventId,
      last_task_check: next.lastTaskCheck,
      last_approval_at: next.lastApprovalAt,
    },
    { onConflict: "showroom_id" },
  );
  if (error) return json({ error: "không lưu được con trỏ quét" }, 500);

  return json({ ok: true, cursor: next });
});
