import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../db/types.ts";
import { conversationMessages, GraphError, pageConversations, type GraphMessage } from "./api.ts";
import { MESSENGER_KEY, type MessengerConfig } from "./config.ts";
import { processMessengerEvents, storeMessengerItems } from "./inbound.ts";
import type { MessengerItem } from "./webhook.ts";

// Đọc lại tin Messenger bị lỡ (CLAUDE.md 10.1 điều 8, docs/integrations/meta_messenger.md). Webhook có thể lỡ: Meta
// chỉ gửi lại trong thời gian ngắn, nhân viên trả lời thẳng trên hộp thư Page mà bản sao tin không về. Mỗi lượt đọc các
// hội thoại vừa cập nhật qua Graph API, lấy 20 tin cuối; tin nào CRM chưa có thì đưa vào đúng đường của webhook
// (webhook_events rồi process_messenger_event), nên chống trùng, tạo lead, đồng hồ SLA giữ nguyên luật.
// Không ghi nội dung tin, PSID ra log.

type Db = SupabaseClient<Database>;

/** Lượt chạy cách lượt trước dưới khoảng này thì bỏ (pg_cron 2 phút một lần; tránh hai lượt chồng nhau). */
const MIN_GAP_MS = 60_000;
/** Đọc lùi thêm so với con trỏ, phòng lệch giờ và tin Meta ghi muộn. */
const OVERLAP_MS = 5 * 60_000;
/** Lượt đầu (chưa có con trỏ) đọc lùi tối đa 7 ngày, không trước mốc bắt đầu. */
const FIRST_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
/** Tối đa 4 trang × 25 hội thoại mỗi lượt. */
const MAX_PAGES = 4;
const PSID = /^[0-9]{1,32}$/;

/** Lỗi đọc lại tin ghi vào integrations.last_error bắt đầu bằng câu này, để lượt chạy tốt sau đó xóa đúng lỗi của mình. */
export const RECONCILE_ERROR_PREFIX = "Không đọc lại được tin Messenger bị lỡ";

/** Thời điểm Meta trả ("2026-10-11T15:51:50+0000" hoặc giây Unix) sang mili giây; sai dạng thì null. */
export function graphTime(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? (v < 1e12 ? v * 1000 : v) : null;
  if (typeof v !== "string" || !v) return null;
  if (/^\d+$/.test(v)) return graphTime(Number(v));
  const t = Date.parse(v.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(t) ? null : t;
}

/**
 * Tệp đính kèm Graph sang dạng webhook ({ type, payload: { url, name } }) để màn Hội thoại đọc chung một kiểu
 * (lib/integrations/attachments.ts).
 */
export function webhookAttachments(
  m: GraphMessage,
): { type: string; payload: { url: string; name?: string } }[] {
  const out: { type: string; payload: { url: string; name?: string } }[] = [];
  for (const a of m.attachments?.data ?? []) {
    const mime = a.mime_type ?? "";
    const name = a.name ? { name: a.name } : {};
    if (a.image_data?.url) out.push({ type: "image", payload: { url: a.image_data.url, ...name } });
    else if (a.video_data?.url) out.push({ type: "video", payload: { url: a.video_data.url, ...name } });
    else if (a.file_url) {
      const type = mime.startsWith("image/")
        ? "image"
        : mime.startsWith("video/")
          ? "video"
          : mime.startsWith("audio/")
            ? "audio"
            : "file";
      out.push({ type, payload: { url: a.file_url, ...name } });
    }
  }
  if (m.sticker) out.push({ type: "sticker", payload: { url: m.sticker } });
  return out;
}

/** Một tin đọc lại từ Graph sang dạng tin webhook. Tin Page gửi thành bản sao (is_echo) như webhook message_echoes. */
export function graphMessageToItem(pageId: string, psid: string, m: GraphMessage): MessengerItem | null {
  const at = graphTime(m.created_time);
  if (!m.id || at === null || !PSID.test(psid)) return null;
  const fromPage = m.from?.id === pageId;
  const attachments = webhookAttachments(m);
  const text = m.message?.trim() ? m.message : undefined;
  // Tin không có chữ, không có tệp đọc được (ví dụ chia sẻ bài viết) thì bỏ qua.
  if (!text && !attachments.length) return null;
  return {
    pageId,
    externalId: m.id,
    eventType: fromPage ? "message_echo" : "message",
    via: "reconcile",
    item: {
      sender: { id: fromPage ? pageId : psid },
      recipient: { id: fromPage ? psid : pageId },
      timestamp: at,
      message: {
        mid: m.id,
        ...(text ? { text } : {}),
        ...(fromPage ? { is_echo: true } : {}),
        ...(attachments.length ? { attachments } : {}),
      },
    },
  };
}

export interface KnownMessage {
  direction: string;
  text: string | null;
  at: number;
  files: number;
}

/**
 * Tin đã có trong CRM nhưng mang mã khác (phòng khi mã tin Graph khác mã trong webhook): cùng chiều, cùng chữ, cùng có
 * hoặc không có tệp, thời điểm lệch dưới 5 giây với tin khách, dưới 90 giây với tin CRM gửi (CRM ghi giờ lúc gửi xong).
 */
export function sameMessage(item: MessengerItem, k: KnownMessage): boolean {
  const out = item.eventType === "message_echo";
  if ((out ? "out" : "in") !== k.direction) return false;
  const text = (item.item.message?.text ?? "").slice(0, 4000);
  if (text !== (k.text ?? "")) return false;
  if ((item.item.message?.attachments?.length ?? 0) > 0 !== k.files > 0) return false;
  return Math.abs((item.item.timestamp ?? 0) - k.at) <= (out ? 90_000 : 5_000);
}

/** Bỏ các tin CRM đã có: theo mã tin, rồi theo nội dung và thời điểm. */
async function unseen(db: Db, cfg: MessengerConfig, psid: string, items: MessengerItem[]) {
  const ids = items.map((i) => i.externalId);
  const [{ data: known }, { data: seen }] = await Promise.all([
    db
      .from("messages")
      .select("external_message_id")
      .eq("showroom_id", cfg.showroomId)
      .in("external_message_id", ids),
    db.from("webhook_events").select("external_id").eq("provider", "meta_messenger").in("external_id", ids),
  ]);
  const have = new Set<string>();
  for (const r of known ?? []) if (r.external_message_id) have.add(r.external_message_id);
  for (const r of seen ?? []) have.add(r.external_id);
  const rest = items.filter((i) => !have.has(i.externalId));
  if (!rest.length) return { fresh: [], byContent: 0 };

  const { data: conv } = await db
    .from("conversations")
    .select("id")
    .eq("showroom_id", cfg.showroomId)
    .eq("channel", "messenger")
    .eq("external_user_id", psid)
    .maybeSingle();
  if (!conv) return { fresh: rest, byContent: 0 };
  const times = rest.map((i) => i.item.timestamp ?? 0);
  const { data: near } = await db
    .from("messages")
    .select("direction, text, attachments, occurred_at")
    .eq("conversation_id", conv.id)
    .gte("occurred_at", new Date(Math.min(...times) - 120_000).toISOString())
    .lte("occurred_at", new Date(Math.max(...times) + 120_000).toISOString());
  const nearby: KnownMessage[] = (near ?? []).map((m) => ({
    direction: m.direction,
    text: m.text,
    at: Date.parse(m.occurred_at),
    files: Array.isArray(m.attachments) ? m.attachments.length : 0,
  }));
  const fresh = rest.filter((i) => !nearby.some((k) => sameMessage(i, k)));
  return { fresh, byContent: rest.length - fresh.length };
}

export interface ReconcileCounts {
  /** Hội thoại đã đọc lại. */
  conversations: number;
  /** Tin CRM chưa có, vừa đưa vào. */
  added: number;
  /** Tin đã có nhưng khác mã (nhận ra theo nội dung). */
  byContent: number;
}

/**
 * Một lượt đọc lại: hội thoại cập nhật từ `since`, chỉ nhận tin từ `floor` (mốc bắt đầu) trở đi để không kéo lịch sử
 * trước khi có CRM vào hội thoại.
 */
export async function reconcileMessenger(
  db: Db,
  cfg: MessengerConfig,
  opts: { since: number; floor: number; fetchImpl?: typeof fetch },
): Promise<ReconcileCounts> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const token = cfg.pageToken ?? "";
  const counts: ReconcileCounts = { conversations: 0, added: 0, byContent: 0 };
  let after: string | undefined;
  for (let n = 0; n < MAX_PAGES; n++) {
    const page = await pageConversations(cfg.pageId, token, after, fetchImpl);
    let reachedOld = false;
    for (const c of page.data ?? []) {
      const updated = graphTime(c.updated_time);
      // Meta trả hội thoại mới cập nhật trước: gặp hội thoại cũ hơn mốc thì các trang sau cũng cũ hơn.
      if (updated !== null && updated < opts.since) {
        reachedOld = true;
        break;
      }
      const psid = c.participants?.data?.find((p) => p.id && p.id !== cfg.pageId)?.id;
      if (!psid || !PSID.test(psid)) continue;
      counts.conversations++;
      const msgs = await conversationMessages(c.id, token, fetchImpl);
      const items = (msgs.data ?? [])
        .map((m) => graphMessageToItem(cfg.pageId, psid, m))
        .filter((i): i is MessengerItem => i !== null && (i.item.timestamp ?? 0) >= opts.floor)
        .sort((a, b) => (a.item.timestamp ?? 0) - (b.item.timestamp ?? 0));
      if (!items.length) continue;
      const { fresh, byContent } = await unseen(db, cfg, psid, items);
      counts.byContent += byContent;
      if (!fresh.length) continue;
      const ids = await storeMessengerItems(db, cfg, fresh);
      await processMessengerEvents(db, cfg, ids, fetchImpl);
      counts.added += ids.length;
    }
    after = page.paging?.cursors?.after;
    if (reachedOld || !page.paging?.next || !after) break;
  }
  return counts;
}

/** Lỗi đọc lại tin viết thành câu Owner hiểu, kèm cách xử lý (CLAUDE.md 11.2). */
export function reconcileErrorMessage(e: unknown): string {
  const p = RECONCILE_ERROR_PREFIX;
  if (!(e instanceof GraphError)) return `${p}: lỗi không xác định, lượt sau CRM tự thử lại.`;
  if (e.code === -1) return `${p}: không gọi được máy chủ Meta, lượt sau CRM tự thử lại.`;
  if (e.code === 190)
    return `${p}: Page access token hết hạn hoặc bị thu hồi. Owner lấy token mới rồi kết nối lại ở Cài đặt, Tích hợp.`;
  const permission =
    e.code === 10 ||
    e.code === 200 ||
    e.code === 230 ||
    (e.code === 100 && /permission|pages_read_engagement|pages_manage_metadata/i.test(e.detail ?? ""));
  if (permission)
    return (
      `${p}: Page access token chưa có quyền pages_read_engagement. Owner thêm quyền này cho ứng dụng Meta, tạo ` +
      "token mới rồi dán lại ở Cài đặt, Tích hợp, Tin nhắn Facebook."
    );
  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613)
    return `${p}: Meta tạm giới hạn số lần gọi, lượt sau CRM tự thử lại.`;
  return `${p} (Meta báo mã ${e.code}), lượt sau CRM tự thử lại.`;
}

export interface ReconcileRun extends Partial<ReconcileCounts> {
  showroomId: string;
  skipped?: "not_connected" | "too_soon";
  error?: string;
}

/** Chạy một lượt cho một showroom: giữ con trỏ, ghi kết quả, báo lỗi lên trang Tích hợp. */
export async function runMessengerReconcile(
  db: Db,
  cfg: MessengerConfig,
  now: number = Date.now(),
  fetchImpl: typeof fetch = fetch,
): Promise<ReconcileRun> {
  const base = { showroomId: cfg.showroomId };
  if (cfg.status !== "connected" || !cfg.pageToken || !cfg.pageId)
    return { ...base, skipped: "not_connected" };
  const at = new Date(now).toISOString();
  const [{ data: state }, { data: integ }] = await Promise.all([
    db
      .from("integration_sync_state")
      .select("start_at, cursor_at, last_run_at")
      .eq("showroom_id", cfg.showroomId)
      .eq("key", MESSENGER_KEY)
      .maybeSingle(),
    db
      .from("integrations")
      .select("id, created_at, connected_at, last_error")
      .eq("showroom_id", cfg.showroomId)
      .eq("key", MESSENGER_KEY)
      .maybeSingle(),
  ]);
  if (state?.last_run_at && now - Date.parse(state.last_run_at) < MIN_GAP_MS)
    return { ...base, skipped: "too_soon" };

  // Mốc bắt đầu: lúc Owner khai Messenger lần đầu (kết nối lại sau đó không dời mốc), đặt ở lượt đầu rồi giữ nguyên.
  const firstSetup = [integ?.created_at, integ?.connected_at]
    .map((v) => (v ? Date.parse(v) : Number.NaN))
    .filter((v) => !Number.isNaN(v));
  const floor = state?.start_at
    ? Date.parse(state.start_at)
    : firstSetup.length
      ? Math.min(...firstSetup)
      : now - FIRST_LOOKBACK_MS;
  const since = state?.cursor_at
    ? Date.parse(state.cursor_at) - OVERLAP_MS
    : Math.max(floor, now - FIRST_LOOKBACK_MS);
  await db.from("integration_sync_state").upsert(
    {
      showroom_id: cfg.showroomId,
      key: MESSENGER_KEY,
      last_run_at: at,
      ...(state?.start_at ? {} : { start_at: new Date(floor).toISOString() }),
    },
    { onConflict: "showroom_id,key" },
  );

  try {
    const counts = await reconcileMessenger(db, cfg, { since, floor, fetchImpl });
    await db
      .from("integration_sync_state")
      .update({ cursor_at: at, last_result: { ...counts, at } })
      .eq("showroom_id", cfg.showroomId)
      .eq("key", MESSENGER_KEY);
    if (integ?.last_error?.startsWith(RECONCILE_ERROR_PREFIX))
      await db
        .from("integrations")
        .update({ last_error: null, last_error_at: null })
        .eq("id", integ.id)
        .like("last_error", `${RECONCILE_ERROR_PREFIX}%`);
    return { ...base, ...counts };
  } catch (e) {
    const error = reconcileErrorMessage(e);
    await db
      .from("integration_sync_state")
      .update({ last_result: { error, at } })
      .eq("showroom_id", cfg.showroomId)
      .eq("key", MESSENGER_KEY);
    // Lỗi mạng chốc lát thì không báo lên trang Tích hợp; lượt sau tự thử lại. Lỗi cũ lặp lại thì không ghi lại giờ
    // lỗi, để thông báo lỗi đấu nối (theo last_error_at) không bắn mỗi 2 phút.
    if (integ && !(e instanceof GraphError && e.code === -1) && integ.last_error !== error)
      await db.from("integrations").update({ last_error: error, last_error_at: at }).eq("id", integ.id);
    return { ...base, error };
  }
}
