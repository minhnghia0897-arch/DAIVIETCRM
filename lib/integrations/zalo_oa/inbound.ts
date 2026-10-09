import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../db/types.ts";
import { maskPhone, normalizePhone } from "../../phone/index.ts";
import { zaloUserName } from "./api.ts";
import type { ZaloConfig } from "./config.ts";
import { ensureZaloToken } from "./token.ts";
import { type ZaloEvent, zaloExternalId } from "./webhook.ts";

// Lưu sự kiện Zalo vào hộp nhận thô rồi xử lý (CLAUDE.md 10.1 điều 3). Chống trùng bằng unique (provider,
// external_id). Không ghi nội dung tin, số điện thoại, mã người dùng ra log.

type Db = SupabaseClient<Database>;

/** Trả mã dòng mới; null khi là tin trùng; lỗi database thì ném để route báo Zalo gửi lại. */
export async function storeZaloEvent(db: Db, cfg: ZaloConfig, e: ZaloEvent): Promise<number | null> {
  const { data, error } = await db
    .from("webhook_events")
    .upsert(
      {
        showroom_id: cfg.showroomId,
        provider: "zalo_oa",
        external_id: zaloExternalId(e),
        event_type: e.event_name,
        signature_valid: true,
        payload: e as never,
      },
      { onConflict: "provider,external_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error("không lưu được sự kiện Zalo");
  return data?.[0]?.id ?? null;
}

/** Chuẩn hóa số khách gửi qua form thông tin (theo đầu số; số Việt Nam là mặc định). */
export function sharedPhone(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const p = normalizePhone(raw, "VN");
  return p.valid
    ? { raw, e164: p.e164, masked: maskPhone(p.e164), valid: true, country: p.country ?? null }
    : { raw, e164: null, masked: "", valid: false, country: null };
}

export async function processZaloEvent(
  db: Db,
  cfg: ZaloConfig,
  id: number,
  e: ZaloEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let name: string | null = null;
  const inbound = e.event_name.startsWith("user_send_") || e.event_name === "user_submit_info";
  const userId = e.sender?.id;
  if (inbound && userId) {
    const { count } = await db
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("showroom_id", cfg.showroomId)
      .eq("channel", "zalo")
      .eq("external_user_id", userId);
    if (!count) {
      const t = await ensureZaloToken(db, cfg, { fetchImpl });
      if (t.ok) name = await zaloUserName(userId, t.accessToken, fetchImpl);
    }
  }
  const phone = e.event_name === "user_submit_info" ? sharedPhone(e.info?.phone) : null;
  const { error } = await db.rpc("process_zalo_event", {
    p_event_id: id,
    p_display_name: name ?? undefined,
    p_phone: (phone ?? undefined) as never,
  });
  if (error)
    await db
      .from("webhook_events")
      .update({ error: `xử lý lỗi: ${error.code ?? "unknown"}` })
      .eq("id", id);
}
