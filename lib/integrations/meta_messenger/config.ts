import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../db/types.ts";

// Cấu hình Messenger theo Page: Page ID nằm ở integrations.config.pageId; App Secret, Page access token và mã xác minh
// webhook nằm trong Supabase Vault (đọc bằng service_role). Không ghi giá trị khóa ra log.

type Db = SupabaseClient<Database>;

export const MESSENGER_KEY = "meta_messenger";

export interface MessengerConfig {
  showroomId: string;
  pageId: string;
  status: string;
  replyMode: string | null;
  appSecret: string | null;
  pageToken: string | null;
  verifyToken: string | null;
}

async function secret(db: Db, showroomId: string, name: string): Promise<string | null> {
  const { data } = await db.rpc("get_integration_secret", {
    p_showroom: showroomId,
    p_key: MESSENGER_KEY,
    p_name: name,
  });
  return data ?? null;
}

async function load(
  db: Db,
  row: { showroom_id: string; config: unknown; status: string; reply_mode: string | null },
) {
  const pageId = (row.config as { pageId?: unknown } | null)?.pageId;
  const [appSecret, pageToken, verifyToken] = await Promise.all([
    secret(db, row.showroom_id, "messenger_app_secret"),
    secret(db, row.showroom_id, "messenger_page_access_token"),
    secret(db, row.showroom_id, "messenger_verify_token"),
  ]);
  return {
    showroomId: row.showroom_id,
    pageId: typeof pageId === "string" ? pageId : "",
    status: row.status,
    replyMode: row.reply_mode,
    appSecret,
    pageToken,
    verifyToken,
  } satisfies MessengerConfig;
}

/** Mọi showroom đã khai Messenger (giai đoạn 1 chỉ một). Dùng cho bước xác minh webhook. */
export async function messengerConfigs(db: Db): Promise<MessengerConfig[]> {
  const { data } = await db
    .from("integrations")
    .select("showroom_id, config, status, reply_mode")
    .eq("key", MESSENGER_KEY);
  return Promise.all((data ?? []).map((r) => load(db, r)));
}

export async function messengerConfigForPage(db: Db, pageId: string): Promise<MessengerConfig | null> {
  return (await messengerConfigs(db)).find((c) => c.pageId === pageId) ?? null;
}

export async function messengerConfigForShowroom(
  db: Db,
  showroomId: string,
): Promise<MessengerConfig | null> {
  const { data } = await db
    .from("integrations")
    .select("showroom_id, config, status, reply_mode")
    .eq("key", MESSENGER_KEY)
    .eq("showroom_id", showroomId)
    .maybeSingle();
  return data ? load(db, data) : null;
}
