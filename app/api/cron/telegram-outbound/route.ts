import { createAdminClient } from "@/lib/db/admin";
import { cronAuthorized } from "@/lib/integrations/cron-auth";
import { linkBase, telegramApi } from "@/lib/integrations/telegram_bot/api";
import { telegramConfig } from "@/lib/integrations/telegram_bot/config";
import { runTelegramOutbound } from "@/lib/integrations/telegram_bot/outbound";

// Đẩy tin Telegram cho nhân viên: lead được giao, hẹn gọi lại tới giờ, lead quá hạn, việc chờ duyệt, kết quả duyệt,
// đấu nối lỗi. pg_cron gọi mỗi phút qua pg_net (public.dispatch_telegram_outbound, chỉ khi bot đã kết nối); trả về
// con trỏ quét, không có nội dung tin hay số điện thoại.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: Request) {
  const admin = createAdminClient();
  if (!(await cronAuthorized(req, admin))) return new Response("không được phép", { status: 401 });
  const cfg = await telegramConfig(admin);
  if (!cfg?.token) return Response.json({ skipped: "chưa cấu hình bot Telegram" });
  try {
    // pg_cron gọi bằng địa chỉ CRM trong Vault (app_base_url), nên nút Mở dưới tin trỏ về đúng địa chỉ đó.
    const base = linkBase(new URL(req.url).origin);
    return Response.json(await runTelegramOutbound(admin, cfg, telegramApi(cfg.token), base));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "lỗi không rõ" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
