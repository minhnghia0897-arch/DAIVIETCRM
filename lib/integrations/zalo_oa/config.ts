import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../db/types.ts";

// Cấu hình Zalo OA: App ID và OA ID nằm ở integrations.config; App Secret, OA Secret Key (ký webhook), refresh token
// và access token nằm trong Supabase Vault (đọc bằng service_role). Không ghi giá trị khóa ra log.

type Db = SupabaseClient<Database>;

export const ZALO_KEY = "zalo_oa";

export interface ZaloConfig {
  showroomId: string;
  appId: string;
  oaId: string;
  status: string;
  replyMode: string | null;
  tokenExpiresAt: string | null;
  appSecret: string | null;
  oaSecretKey: string | null;
  refreshToken: string | null;
  accessToken: string | null;
}

type Row = {
  showroom_id: string;
  config: unknown;
  status: string;
  reply_mode: string | null;
  token_expires_at: string | null;
};

async function secret(db: Db, showroomId: string, name: string): Promise<string | null> {
  const { data } = await db.rpc("get_integration_secret", {
    p_showroom: showroomId,
    p_key: ZALO_KEY,
    p_name: name,
  });
  return data ?? null;
}

async function load(db: Db, row: Row): Promise<ZaloConfig> {
  const c = (row.config ?? {}) as { appId?: unknown; oaId?: unknown };
  const [appSecret, oaSecretKey, refreshToken, accessToken] = await Promise.all(
    ["zalo_app_secret", "zalo_oa_secret_key", "zalo_refresh_token", "zalo_access_token"].map((n) =>
      secret(db, row.showroom_id, n),
    ),
  );
  return {
    showroomId: row.showroom_id,
    appId: typeof c.appId === "string" ? c.appId : "",
    oaId: typeof c.oaId === "string" ? c.oaId : "",
    status: row.status,
    replyMode: row.reply_mode,
    tokenExpiresAt: row.token_expires_at,
    appSecret,
    oaSecretKey,
    refreshToken,
    accessToken,
  };
}

const COLS = "showroom_id, config, status, reply_mode, token_expires_at";

export async function zaloConfigForOa(db: Db, oaId: string): Promise<ZaloConfig | null> {
  const { data } = await db.from("integrations").select(COLS).eq("key", ZALO_KEY).eq("config->>oaId", oaId);
  return data?.[0] ? load(db, data[0]) : null;
}

export async function zaloConfigForShowroom(db: Db, showroomId: string): Promise<ZaloConfig | null> {
  const { data } = await db
    .from("integrations")
    .select(COLS)
    .eq("key", ZALO_KEY)
    .eq("showroom_id", showroomId)
    .maybeSingle();
  return data ? load(db, data) : null;
}

export async function zaloConfigs(db: Db): Promise<ZaloConfig[]> {
  const { data } = await db.from("integrations").select(COLS).eq("key", ZALO_KEY);
  return Promise.all((data ?? []).map((r) => load(db, r)));
}
