import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../db/types.ts";
import { userAvatar } from "./api.ts";
import type { MessengerConfig } from "./config.ts";

// Ảnh đại diện khách Messenger cho màn Hội thoại. Link profile_pic của Meta hết hạn sau một thời gian, nên mỗi lượt
// đọc lại tin (2 phút) làm mới vài hội thoại chưa kiểm hoặc kiểm đã cũ, hội thoại mới nhắn trước. Không lưu bản sao
// ảnh, không ghi PSID hay link ảnh ra log.

type Db = SupabaseClient<Database>;

/** Kiểm lại ảnh sau khoảng này. */
const AVATAR_TTL_MS = 2 * 24 * 60 * 60_000;
/** Số hội thoại mỗi lượt, để một lượt không gọi Meta quá nhiều. */
const AVATAR_BATCH = 10;

export interface AvatarRefresh {
  checked: number;
  found: number;
  /** Mã lỗi Meta gần nhất (thiếu quyền xem hồ sơ khách thường là mã 10, 100 hoặc 200). */
  error?: number;
}

export async function refreshMessengerAvatars(
  db: Db,
  cfg: MessengerConfig,
  now: number = Date.now(),
  fetchImpl: typeof fetch = fetch,
): Promise<AvatarRefresh> {
  const out: AvatarRefresh = { checked: 0, found: 0 };
  if (cfg.status !== "connected" || !cfg.pageToken) return out;
  const at = new Date(now).toISOString();
  const stale = new Date(now - AVATAR_TTL_MS).toISOString();
  const { data } = await db
    .from("conversations")
    .select("id, external_user_id")
    .eq("showroom_id", cfg.showroomId)
    .eq("channel", "messenger")
    .or(`avatar_checked_at.is.null,avatar_checked_at.lt."${stale}"`)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(AVATAR_BATCH);
  for (const c of data ?? []) {
    const r = await userAvatar(c.external_user_id, cfg.pageToken, fetchImpl);
    // Không gọi được Meta (mạng): để lượt sau thử lại, không đánh dấu đã kiểm.
    if (r.error === -1) continue;
    out.checked++;
    if (r.url) out.found++;
    if (r.error !== undefined) out.error = r.error;
    // Meta từ chối thì giữ ảnh cũ (nếu có), chỉ ghi giờ kiểm để không hỏi lại liên tục.
    await db
      .from("conversations")
      .update(
        r.error === undefined ? { avatar_url: r.url, avatar_checked_at: at } : { avatar_checked_at: at },
      )
      .eq("id", c.id);
  }
  return out;
}
