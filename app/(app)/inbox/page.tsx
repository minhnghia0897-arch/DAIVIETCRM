import type { Metadata } from "next";

import { InboxLive, type LiveConv } from "@/components/crm/views/inbox-live";
import { requireAnyPermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { CONV_SELECT, UUID_RE, loadOpened } from "@/lib/inbox/thread-server";
import { MESSENGER_KEY } from "@/lib/integrations/meta_messenger/config";
import { ZALO_KEY } from "@/lib/integrations/zalo_oa/config";
import { vnMonthStart } from "@/lib/integrations/zalo_oa/window";

import { assignLeads } from "../leads/actions";
import { markConversationRead, sendReply } from "./actions";
import {
  assignConversation,
  createContactTag,
  qualifyConversation,
  setConversationDone,
  switchConversationAi,
  toggleContactTag,
} from "./side-actions";

export const metadata: Metadata = { title: "Hội thoại · Đại Việt CRM" };

// Hội thoại chung mọi kênh (Messenger, Zalo OA). RLS chỉ trả hội thoại của lead mình đang giữ, hoặc khách đang hỏi
// (chưa có lead) được giao cho mình, trừ người có message.view_all (CLAUDE.md mục 5, 6).
// Danh sách, hội thoại đang mở (?c=) và cài đặt kênh tải song song; bấm chuyển hội thoại trên màn không tải lại
// trang mà lấy qua app/api/inbox/thread (components/crm/views/inbox-live.tsx).
export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requireAnyPermission([
    "message.zalo_send",
    "message.messenger_send",
    "message.view_all",
  ]);
  const { c } = await searchParams;
  const supabase = await createClient();
  // Chế độ trả lời không phải bí mật; đọc bằng service_role vì bảng integrations chỉ mở cho người có quyền Cài đặt.
  const admin = createAdminClient();
  const canAssign = user.permissions.has("lead.assign") && !user.viewAs;
  // Tin Zalo tính phí đã gửi trong tháng (giờ VN), để người gửi biết đã dùng bao nhiêu hạn mức gói OA.
  const monthStart = vnMonthStart(new Date()).toISOString();

  const [
    { data: convs },
    opened,
    { data: tags },
    { data: assignees },
    { data: aiChannels },
    { data: integs },
    { count: paidThisMonth },
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select(CONV_SELECT)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(100),
    // Mở từ link (?c=), kể cả hội thoại cũ ngoài 100 dòng đầu; RLS vẫn kiểm người xem.
    c && UUID_RE.test(c) ? loadOpened(supabase, user, c) : Promise.resolve(null),
    supabase.from("tags").select("id, label, color").order("sort"),
    canAssign
      ? supabase.rpc("lead_assignees")
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    // Kênh Trợ lý AI đang tự trả lời (Cài đặt, Trợ lý AI).
    supabase.rpc("ai_reply_channels"),
    admin
      .from("integrations")
      .select("key, status, reply_mode")
      .eq("showroom_id", user.showroomId)
      .in("key", [MESSENGER_KEY, ZALO_KEY]),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("showroom_id", user.showroomId)
      .eq("tag", "paid")
      .eq("status", "sent")
      .gte("occurred_at", monthStart),
  ]);
  let list = convs ?? [];
  if (opened && !list.some((x) => x.id === opened.conv.id)) list = [opened.conv, ...list];
  const leadIds = list.map((x) => x.lead_id).filter((x): x is string => Boolean(x));
  const contactIds = [...new Set(list.map((x) => x.contact_id).filter((x): x is string => Boolean(x)))];
  const [{ data: leads }, { data: recent }, { data: contactTags }] = await Promise.all([
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
    contactIds.length
      ? supabase.from("contact_tags").select("contact_id, tag_id").in("contact_id", contactIds)
      : Promise.resolve({ data: [] as { contact_id: string; tag_id: string }[] }),
  ]);
  const tagsOf = (contactId: string | null) =>
    (contactTags ?? []).filter((t) => t.contact_id === contactId).map((t) => t.tag_id);
  const leadOf = (id: string | null) => leads?.find((l) => l.id === id);
  // Người phụ trách: người giữ lead; khách đang hỏi (chưa có lead) thì người được giao hội thoại.
  const holderOf = (x: (typeof list)[number]) =>
    x.lead_id ? (leadOf(x.lead_id)?.assigned_to ?? null) : x.assigned_to;
  const holderIds = [...new Set(list.map(holderOf).filter((x): x is string => Boolean(x)))];
  const { data: people } = holderIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", holderIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameOf = (id: string | null | undefined) => people?.find((p) => p.id === id)?.full_name ?? null;

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
    channel: x.channel === "zalo" ? "zalo" : "messenger",
    name: x.contacts?.full_name ?? x.display_name ?? "Khách",
    avatar: x.avatar_url,
    lastAt: x.last_message_at,
    lastInboundAt: x.last_inbound_at,
    unread: x.unread_count,
    preview: last.get(x.id) ?? null,
    leadId: x.lead_id,
    contactId: x.contact_id,
    holderId: holderOf(x),
    holder: nameOf(holderOf(x)),
    mine: holderOf(x) === user.id,
    done: x.status === "done",
    tagIds: tagsOf(x.contact_id),
    ai: (aiChannels ?? []).includes(x.channel) ? (x.ai_paused_at ? "paused" : "on") : null,
    aiPause: x.ai_pause_reason,
  }));

  const blockerFor = (key: string, perm: string, name: string) => {
    const integ = integs?.find((i) => i.key === key);
    if (!integ || integ.status === "not_connected" || integ.status === "not_available")
      return `${name} chưa kết nối, Owner kết nối ở Cài đặt, Tích hợp`;
    if (integ.reply_mode === "external") return "Kênh này đang được trả lời ở công cụ khác, CRM chỉ đọc";
    if (integ.reply_mode === "off") return "Kênh này đang tắt trong Cài đặt, Tích hợp";
    if (integ.status === "paused") return "Kênh này đang tạm dừng trong Cài đặt, Tích hợp";
    if (user.viewAs) return "Đang xem như người dùng khác, chỉ đọc";
    if (!user.permissions.has(perm)) return `Anh chị chưa được cấp quyền gửi tin ${name}`;
    return null;
  };

  return (
    <InboxLive
      convs={rows}
      selectedId={opened?.conv.id ?? null}
      thread={opened?.thread ?? null}
      side={opened?.side ?? null}
      blockers={{
        messenger: blockerFor(MESSENGER_KEY, "message.messenger_send", "Tin nhắn Facebook"),
        zalo: blockerFor(ZALO_KEY, "message.zalo_send", "Zalo OA"),
      }}
      paidThisMonth={paidThisMonth ?? 0}
      send={sendReply}
      markRead={markConversationRead}
      tags={tags ?? []}
      assignees={canAssign ? (assignees ?? []).map((a) => ({ id: a.id, name: a.full_name })) : null}
      assign={assignLeads}
      assignConv={canAssign ? assignConversation : undefined}
      qualify={canAssign ? qualifyConversation : undefined}
      aiSwitch={user.viewAs ? undefined : switchConversationAi}
      setDone={setConversationDone}
      toggleTag={toggleContactTag}
      createTag={createContactTag}
    />
  );
}
