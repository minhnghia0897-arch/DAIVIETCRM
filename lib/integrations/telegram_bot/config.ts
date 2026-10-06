import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../db/types.ts";

// Cấu hình bot dùng chung cho webhook, việc nền và trang Cài đặt.
//
// Nguồn chuẩn là Cài đặt → Tích hợp: tên bot nằm ở `integrations.config.botUsername`, token và mã bí mật webhook nằm
// trong Supabase Vault (`integration_secrets`, đọc bằng service_role). Biến môi trường chỉ là đường lui cho máy chạy
// thử, nơi Owner chưa dán khóa qua giao diện (CLAUDE.md mục 10.1 điểm 5). Không bao giờ ghi token ra log.

type Db = SupabaseClient<Database>;

export const TELEGRAM_KEY = "telegram_bot";

/** Biến môi trường server, đọc được cả ở Next (Node) lẫn Edge Function (Deno). */
function env(name: string): string | undefined {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> };
    Deno?: { env?: { get(n: string): string | undefined } };
  };
  return g.process?.env?.[name] ?? g.Deno?.env?.get?.(name);
}

export interface TelegramConfig {
  showroomId: string;
  /** Tên bot không có @, để dựng link liên kết https://t.me/<bot>?start=<mã>. */
  botUsername: string | null;
  token: string | null;
  webhookSecret: string | null;
}

/** Showroom đang dùng bot. Giai đoạn 1 mỗi lần cài chỉ một showroom (CLAUDE.md mục 1). */
async function showroomOf(db: Db, configured: string | undefined): Promise<string | null> {
  if (configured) return configured;
  const { data } = await db.from("showrooms").select("id").order("created_at").limit(1).maybeSingle();
  return data?.id ?? null;
}

async function vaultSecret(db: Db, showroomId: string, name: string): Promise<string | null> {
  const { data } = await db.rpc("get_integration_secret", {
    p_showroom: showroomId,
    p_key: TELEGRAM_KEY,
    p_name: name,
  });
  return data ?? null;
}

/** Đọc cấu hình bot bằng client service_role. Trả null khi chưa có showroom nào. */
export async function telegramConfig(db: Db): Promise<TelegramConfig | null> {
  const { data: row } = await db
    .from("integrations")
    .select("showroom_id, config")
    .eq("key", TELEGRAM_KEY)
    .maybeSingle();
  const showroomId = await showroomOf(db, row?.showroom_id);
  if (!showroomId) return null;

  const config = (row?.config ?? {}) as { botUsername?: unknown };
  const [token, webhookSecret] = await Promise.all([
    vaultSecret(db, showroomId, "telegram_bot_token"),
    vaultSecret(db, showroomId, "telegram_webhook_secret"),
  ]);

  return {
    showroomId,
    botUsername:
      (typeof config.botUsername === "string" && config.botUsername.trim()) ||
      env("TELEGRAM_BOT_USERNAME")?.trim() ||
      null,
    token: token ?? env("TELEGRAM_BOT_TOKEN") ?? null,
    webhookSecret: webhookSecret ?? env("TELEGRAM_WEBHOOK_SECRET") ?? null,
  };
}
