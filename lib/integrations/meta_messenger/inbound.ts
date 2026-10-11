import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../db/types.ts";
import { userName } from "./api.ts";
import type { MessengerConfig } from "./config.ts";
import type { MessengerItem } from "./webhook.ts";

// Lưu tin vào hộp nhận thô rồi xử lý (CLAUDE.md 10.1 điều 3). Chống trùng bằng unique (provider, external_id):
// Meta gửi lại cùng tin thì lần sau bỏ qua. Không ghi nội dung tin, PSID ra log.

type Db = SupabaseClient<Database>;

/** Tên tạm database đặt khi chưa biết tên khách (migration 20261008000200_messenger.sql). */
const PLACEHOLDER = "Khách Messenger ";

export async function storeMessengerItems(
  db: Db,
  cfg: MessengerConfig,
  items: MessengerItem[],
): Promise<number[]> {
  if (!items.length) return [];
  const { data } = await db
    .from("webhook_events")
    .upsert(
      items.map((i) => ({
        showroom_id: cfg.showroomId,
        provider: "meta_messenger",
        external_id: i.externalId,
        event_type: i.eventType,
        signature_valid: true,
        payload: { page_id: i.pageId, item: i.item, ...(i.via ? { via: i.via } : {}) } as never,
      })),
      { onConflict: "provider,external_id", ignoreDuplicates: true },
    )
    .select("id, external_id");
  // Trả theo đúng thứ tự đầu vào: tin cũ xử lý trước để hội thoại mới được tạo trước bản sao tin của Page.
  const order = new Map(items.map((i, n) => [i.externalId, n]));
  return (data ?? [])
    .sort((a, b) => (order.get(a.external_id) ?? 0) - (order.get(b.external_id) ?? 0))
    .map((r) => r.id);
}

/** Xử lý các tin vừa lưu. Khách lần đầu nhắn thì hỏi Meta tên khách (không được thì để tên tạm). */
export async function processMessengerEvents(
  db: Db,
  cfg: MessengerConfig,
  ids: number[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  for (const id of ids) {
    const { data: ev } = await db
      .from("webhook_events")
      .select("event_type, payload")
      .eq("id", id)
      .maybeSingle();
    if (!ev) continue;
    let name: string | null = null;
    let contactToRename: string | null = null;
    const psid = (ev.payload as { item?: { sender?: { id?: string } } } | null)?.item?.sender?.id;
    if (ev.event_type !== "message_echo" && psid && cfg.pageToken) {
      // Khách mới, hoặc khách còn tên tạm ("Khách Messenger 1234"): hỏi lại Meta tên thật mỗi khi khách nhắn.
      const { data: conv } = await db
        .from("conversations")
        .select("contact_id, contacts(full_name)")
        .eq("showroom_id", cfg.showroomId)
        .eq("channel", "messenger")
        .eq("external_user_id", psid)
        .maybeSingle();
      const placeholder = conv?.contacts?.full_name?.startsWith(PLACEHOLDER) ?? false;
      if (!conv || placeholder)
        name = await userName(psid, cfg.pageToken, fetchImpl, cfg.pageId || undefined);
      if (name && conv?.contact_id && placeholder) contactToRename = conv.contact_id;
    }
    const { error } = await db.rpc("process_messenger_event", {
      p_event_id: id,
      p_display_name: name ?? undefined,
    });
    if (!error && contactToRename && name) {
      // Chỉ thay tên tạm; tên nhân viên đã sửa tay thì giữ nguyên.
      await db
        .from("contacts")
        .update({ full_name: name })
        .eq("id", contactToRename)
        .like("full_name", `${PLACEHOLDER}%`);
    }
    if (error) {
      // Để job mỗi phút thử lại; ghi lỗi ngắn, không kèm nội dung tin.
      await db
        .from("webhook_events")
        .update({ error: `xử lý lỗi: ${error.code ?? "unknown"}` })
        .eq("id", id);
    }
  }
}
