import type { Metadata } from "next";

import { InboxLive, type LiveConv, type LiveThread } from "@/components/crm/views/inbox-live";
import { requireAnyPermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { MESSENGER_KEY } from "@/lib/integrations/meta_messenger/config";

import { markConversationRead, sendMessengerReply } from "./actions";

export const metadata: Metadata = { title: "Hội thoại · Đại Việt CRM" };

// Hội thoại Messenger thật. RLS chỉ trả hội thoại của lead mình đang giữ, trừ người có message.view_all
// (CLAUDE.md mục 5). Zalo OA nối sau theo cùng bảng conversations, messages.
export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requireAnyPermission([
    "message.zalo_send",
    "message.messenger_send",
    "message.view_all",
  ]);
  const { c } = await searchParams;
  const supabase = await createClient();

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, display_name, last_inbound_at, last_message_at, unread_count, lead_id, contacts(full_name)")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  const list = convs ?? [];
  const leadIds = list.map((x) => x.lead_id).filter((x): x is string => Boolean(x));
  const [{ data: leads }, { data: recent }] = await Promise.all([
    leadIds.length
      ? supabase.from("leads").select("id, stage, assigned_to").in("id", leadIds)
      : Promise.resolve({ data: [] as { id: string; stage: string; assigned_to: string | null }[] }),
    list.length
      ? supabase
          .from("messages")
          .select("conversation_id, direction, text, attachments")
          .in(
            "conversation_id",
            list.map((x) => x.id),
          )
          .order("occurred_at", { ascending: false })
          .limit(400)
      : Promise.resolve({ data: [] }),
  ]);
  const holderIds = [
    ...new Set((leads ?? []).map((l) => l.assigned_to).filter((x): x is string => Boolean(x))),
  ];
  const { data: people } = holderIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", holderIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameOf = (id: string | null | undefined) => people?.find((p) => p.id === id)?.full_name ?? null;
  const leadOf = (id: string | null) => leads?.find((l) => l.id === id);

  const last = new Map<string, { out: boolean; text: string }>();
  for (const m of recent ?? []) {
    if (last.has(m.conversation_id)) continue;
    const files = Array.isArray(m.attachments) ? m.attachments.length : 0;
    last.set(m.conversation_id, {
      out: m.direction === "out",
      text: m.text ?? (files ? "Tệp đính kèm" : ""),
    });
  }

  const rows: LiveConv[] = list.map((x) => ({
    id: x.id,
    name: x.contacts?.full_name ?? x.display_name ?? "Khách Messenger",
    lastAt: x.last_message_at,
    lastInboundAt: x.last_inbound_at,
    unread: x.unread_count,
    preview: last.get(x.id) ?? null,
    leadId: x.lead_id,
    holder: nameOf(leadOf(x.lead_id)?.assigned_to),
    mine: leadOf(x.lead_id)?.assigned_to === user.id,
  }));

  const sel = rows.find((x) => x.id === c) ?? null;
  let thread: LiveThread | null = null;
  if (sel) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, direction, text, attachments, status, error, sent_by, sent_via, tag, occurred_at")
      .eq("conversation_id", sel.id)
      .order("occurred_at", { ascending: true })
      .limit(300);
    const senders = [...new Set((msgs ?? []).map((m) => m.sent_by).filter((x): x is string => Boolean(x)))];
    const { data: staff } = senders.length
      ? await supabase.from("profiles").select("id, full_name").in("id", senders)
      : { data: [] as { id: string; full_name: string }[] };
    thread = {
      id: sel.id,
      messages: (msgs ?? []).map((m) => ({
        id: m.id,
        out: m.direction === "out",
        text: m.text,
        files: Array.isArray(m.attachments) ? m.attachments.length : 0,
        at: m.occurred_at,
        status: m.status as LiveThread["messages"][number]["status"],
        error: m.error,
        by: staff?.find((p) => p.id === m.sent_by)?.full_name ?? (m.sent_via === "page" ? "Trên Page" : null),
        humanAgent: m.tag === "HUMAN_AGENT",
      })),
    };
  }

  // Chế độ trả lời không phải bí mật; đọc bằng service_role vì bảng integrations chỉ mở cho người có quyền Cài đặt.
  const { data: integ } = await createAdminClient()
    .from("integrations")
    .select("status, reply_mode")
    .eq("showroom_id", user.showroomId)
    .eq("key", MESSENGER_KEY)
    .maybeSingle();
  const blocker =
    !integ || integ.status === "not_connected" || integ.status === "not_available"
      ? "Tin nhắn Facebook chưa kết nối, Owner kết nối ở Cài đặt, Tích hợp"
      : integ.reply_mode === "external"
        ? "Kênh này đang được trả lời ở công cụ khác, CRM chỉ đọc"
        : integ.reply_mode === "off"
          ? "Kênh này đang tắt trong Cài đặt, Tích hợp"
          : integ.status === "paused"
            ? "Kênh này đang tạm dừng trong Cài đặt, Tích hợp"
            : user.viewAs
              ? "Đang xem như người dùng khác, chỉ đọc"
              : !user.permissions.has("message.messenger_send")
                ? "Anh chị chưa được cấp quyền gửi tin Messenger"
                : null;

  return (
    <InboxLive
      convs={rows}
      selectedId={sel?.id ?? null}
      thread={thread}
      blocker={blocker}
      send={sendMessengerReply}
      markRead={markConversationRead}
    />
  );
}
