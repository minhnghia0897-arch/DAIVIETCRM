import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../db/types.ts";
import { refreshOaToken, zaloErrorMessage } from "./api.ts";
import { ZALO_KEY, type ZaloConfig } from "./config.ts";

// Access token Zalo OA sống ngắn, refresh token chỉ dùng được một lần (docs/integrations/zalo_oa.md). Làm mới khi
// token còn dưới `margin` hoặc khi bị ép; giữ khóa ở database để hai tiến trình không cùng dùng một refresh token.
// Làm mới thất bại: đấu nối chuyển sang Lỗi và Owner được báo trên chuông.

type Db = SupabaseClient<Database>;

const MARGIN_MS = 60 * 60_000;

export async function ensureZaloToken(
  db: Db,
  cfg: ZaloConfig,
  opts: { force?: boolean; marginMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true; accessToken: string } | { ok: false; message: string }> {
  const left = cfg.tokenExpiresAt ? Date.parse(cfg.tokenExpiresAt) - Date.now() : -1;
  if (!opts.force && cfg.accessToken && left > (opts.marginMs ?? MARGIN_MS))
    return { ok: true, accessToken: cfg.accessToken };
  if (!cfg.appId || !cfg.appSecret || !cfg.refreshToken)
    return { ok: false, message: "Chưa đủ App ID, App Secret và refresh token của Zalo OA." };

  const { data: leased } = await db.rpc("lease_token_refresh", {
    p_showroom: cfg.showroomId,
    p_key: ZALO_KEY,
    p_seconds: 60,
  });
  if (!leased) {
    // Tiến trình khác đang làm mới: token cũ còn hạn thì dùng tạm.
    return cfg.accessToken && left > 0
      ? { ok: true, accessToken: cfg.accessToken }
      : { ok: false, message: "Đang làm mới token Zalo OA, thử lại sau vài giây." };
  }

  try {
    const t = await refreshOaToken(
      { appId: cfg.appId, appSecret: cfg.appSecret, refreshToken: cfg.refreshToken },
      opts.fetchImpl,
    );
    // Lưu refresh token mới trước: mất nó thì phải xin lại quyền OA.
    await db.rpc("store_integration_token", {
      p_showroom: cfg.showroomId,
      p_key: ZALO_KEY,
      p_name: "zalo_refresh_token",
      p_value: t.refreshToken,
    });
    await db.rpc("store_integration_token", {
      p_showroom: cfg.showroomId,
      p_key: ZALO_KEY,
      p_name: "zalo_access_token",
      p_value: t.accessToken,
      p_expires_at: t.expiresAt.toISOString(),
    });
    cfg.accessToken = t.accessToken;
    cfg.refreshToken = t.refreshToken;
    cfg.tokenExpiresAt = t.expiresAt.toISOString();
    return { ok: true, accessToken: t.accessToken };
  } catch (e) {
    const message = `Không làm mới được token Zalo OA. ${zaloErrorMessage(e)}`;
    await db.rpc("mark_integration_error", {
      p_showroom: cfg.showroomId,
      p_key: ZALO_KEY,
      p_message: message,
    });
    return { ok: false, message };
  }
}
