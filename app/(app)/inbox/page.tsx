import type { Metadata } from "next";

import { InboxLive, type LiveConv, type LiveThread } from "@/components/crm/views/inbox-live";
import type { LiveSide, OrderSide } from "@/components/crm/views/inbox-live-side";
import { PROVINCE_NAMES } from "@/lib/geo/provinces";
import { extractFindings } from "@/lib/inbox/extract";
import { LEAD_STAGE_LABEL } from "@/lib/leads/labels";
import { parseAttachments } from "@/lib/integrations/attachments";
import { requireAnyPermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { MESSENGER_KEY } from "@/lib/integrations/meta_messenger/config";
import { loadCatalog } from "@/lib/sales/catalog-server";
import { contextOf } from "@/lib/sales/checkout-server";
import { ZALO_KEY } from "@/lib/integrations/zalo_oa/config";
import { vnMonthStart } from "@/lib/integrations/zalo_oa/window";

import { assignLeads } from "../leads/actions";
import { markConversationRead, sendReply } from "./actions";
import {
  assignConversation,
  createContactTag,
  qualifyConversation,
  setConversationDone,
  toggleContactTag,
} from "./side-actions";

export const metadata: Metadata = { title: "Hội thoại · Đại Việt CRM" };

// Hội thoại chung mọi kênh (Messenger, Zalo OA). RLS chỉ trả hội thoại của lead mình đang giữ, hoặc khách đang hỏi
// (chưa có lead) được giao cho mình, trừ người có message.view_all (CLAUDE.md mục 5, 6).
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
    .select(
      "id, channel, status, display_name, avatar_url, last_inbound_at, last_message_at, unread_count, lead_id, assigned_to, contact_id, contacts(full_name, country_of_residence)",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  const list = convs ?? [];
  const leadIds = list.map((x) => x.lead_id).filter((x): x is string => Boolean(x));
  const contactIds = [...new Set(list.map((x) => x.contact_id).filter((x): x is string => Boolean(x)))];
  const canAssign = user.permissions.has("lead.assign") && !user.viewAs;
  const [{ data: leads }, { data: recent }, { data: tags }, { data: contactTags }, { data: assignees }] =
    await Promise.all([
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
      supabase.from("tags").select("id, label, color").order("sort"),
      contactIds.length
        ? supabase.from("contact_tags").select("contact_id, tag_id").in("contact_id", contactIds)
        : Promise.resolve({ data: [] as { contact_id: string; tag_id: string }[] }),
      canAssign
        ? supabase.rpc("lead_assignees")
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
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
        media: parseAttachments(m.attachments),
        at: m.occurred_at,
        status: m.status as LiveThread["messages"][number]["status"],
        error: m.error,
        by:
          staff?.find((p) => p.id === m.sent_by)?.full_name ??
          (m.sent_via === "page" ? (sel.channel === "zalo" ? "Trên OA" : "Trên Page") : null),
        tag: m.tag === "HUMAN_AGENT" ? "Trả lời tay" : m.tag === "paid" ? "Tin tính phí" : null,
      })),
    };
  }

  const side = sel
    ? await loadSide(
        supabase,
        list.find((x) => x.id === sel.id)!,
        thread,
        user,
      )
    : null;

  // Chế độ trả lời không phải bí mật; đọc bằng service_role vì bảng integrations chỉ mở cho người có quyền Cài đặt.
  const admin = createAdminClient();
  const { data: integs } = await admin
    .from("integrations")
    .select("key, status, reply_mode")
    .eq("showroom_id", user.showroomId)
    .in("key", [MESSENGER_KEY, ZALO_KEY]);
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

  // Tin Zalo tính phí đã gửi trong tháng (giờ VN), để người gửi biết đã dùng bao nhiêu hạn mức gói OA.
  const monthStart = vnMonthStart(new Date()).toISOString();
  const { count: paidThisMonth } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("showroom_id", user.showroomId)
    .eq("tag", "paid")
    .eq("status", "sent")
    .gte("occurred_at", monthStart);

  return (
    <InboxLive
      convs={rows}
      selectedId={sel?.id ?? null}
      thread={thread}
      side={side}
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
      setDone={setConversationDone}
      toggleTag={toggleContactTag}
      createTag={createContactTag}
    />
  );
}

type Db = Awaited<ReturnType<typeof createClient>>;
type ConvRow = {
  id: string;
  lead_id: string | null;
  contact_id: string | null;
  contacts: { full_name: string; country_of_residence: string } | null;
};
type Me = Awaited<ReturnType<typeof requireAnyPermission>>;

const noteTime = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});

/** Cột phải: hồ sơ khách, thông tin đọc từ tin của khách, bốn thông tin bắt buộc, địa chỉ, ghi chú (RLS lọc theo quyền). */
async function loadSide(
  supabase: Db,
  conv: ConvRow,
  thread: LiveThread | null,
  me: Me,
): Promise<LiveSide | null> {
  if (!conv.contact_id || !conv.contacts) return null;
  const contactId = conv.contact_id;
  const [lead, identities, addresses, notes, occasions, budgets, markets] = await Promise.all([
    conv.lead_id
      ? supabase
          .from("leads")
          .select(
            "id, stage, assigned_to, contact_id, recipient_contact_id, recipient_province, occasion_id, occasion_date, budget_range_id, keep_surprise, recipient:contacts!leads_recipient_contact_id_fkey(full_name, relation_in_household)",
          )
          .eq("id", conv.lead_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("contact_identity_display")
      .select("display_masked")
      .eq("contact_id", contactId)
      .eq("type", "phone"),
    supabase
      .from("contact_addresses")
      .select("id, receiver, street, ward, district, province, is_default")
      .eq("contact_id", contactId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("contact_notes")
      .select("id, text, pinned, created_at, created_by")
      .eq("contact_id", contactId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("occasions").select("id, label").eq("is_active", true).order("sort"),
    supabase.from("budget_ranges").select("id, label").eq("is_active", true).order("sort"),
    supabase.from("markets").select("country_code, name").eq("is_active", true).order("sort"),
  ]);
  const authors = [
    ...new Set((notes.data ?? []).map((n) => n.created_by).filter((x): x is string => Boolean(x))),
  ];
  const { data: people } = authors.length
    ? await supabase.from("profiles").select("id, full_name").in("id", authors)
    : { data: [] as { id: string; full_name: string }[] };
  const l = lead.data;
  const canEdit =
    !me.viewAs &&
    (me.permissions.has("lead.edit_all") ||
      (me.permissions.has("lead.edit_own") && l?.assigned_to === me.id));

  const inbound = (thread?.messages ?? [])
    .filter((m) => !m.out && m.text)
    .map((m) => [m.text!, noteTime.format(new Date(m.at))] as [string, string]);

  const order = await loadOrderSide(supabase, me, contactId, l);

  return {
    order,
    contact: {
      id: contactId,
      name: conv.contacts.full_name,
      country: conv.contacts.country_of_residence,
      phones: (identities.data ?? []).map((i) => i.display_masked).filter((x): x is string => Boolean(x)),
    },
    canEdit,
    lead: l
      ? {
          id: l.id,
          stageLabel: LEAD_STAGE_LABEL[l.stage] ?? l.stage,
          recipient: !l.recipient_contact_id
            ? null
            : l.recipient_contact_id === l.contact_id
              ? { self: true, name: null, relation: null }
              : {
                  self: false,
                  name: l.recipient?.full_name ?? null,
                  relation: l.recipient?.relation_in_household ?? null,
                },
          recipientProvince: l.recipient_province,
          occasionId: l.occasion_id,
          occasionDate: l.occasion_date,
          budgetRangeId: l.budget_range_id,
          keepSurprise: l.keep_surprise,
        }
      : null,
    occasions: occasions.data ?? [],
    budgets: budgets.data ?? [],
    markets: (markets.data ?? []).map((m) => ({ code: m.country_code, name: m.name })),
    provinces: PROVINCE_NAMES,
    addresses: (addresses.data ?? []).map((a) => ({
      id: a.id,
      receiver: a.receiver,
      street: a.street,
      ward: a.ward,
      district: a.district,
      province: a.province,
      isDefault: a.is_default,
    })),
    notes: (notes.data ?? []).map((n) => ({
      id: n.id,
      text: n.text,
      pinned: n.pinned,
      by: people?.find((p) => p.id === n.created_by)?.full_name ?? "Nhân viên",
      at: noteTime.format(new Date(n.created_at)),
    })),
    // Sản phẩm: dò mã SKU đang bán (khách hay nhắn "DC302", "dc 302").
    findings: extractFindings(
      inbound,
      PROVINCE_NAMES,
      order.products.map((p) => ({
        key: p.variantId,
        label: p.name,
        words: [p.sku.toLowerCase(), p.sku.toLowerCase().replace(/^([a-z]+)(\d)/, "$1 $2")],
      })),
    ),
  };
}

const ORDER_STATUS: Record<string, string> = {
  draft: "Nháp",
  pending_approval: "Chờ duyệt giảm giá",
  confirmed: "Đã xác nhận",
  deposit_paid: "Đã cọc",
  ready_to_ship: "Sẵn sàng giao",
  delivering: "Đang giao",
  installed: "Đã lắp",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  return_requested: "Yêu cầu đổi trả",
  returned: "Đã trả hàng",
};

type LeadForOrder = {
  id: string;
  contact_id: string;
  recipient_contact_id: string | null;
  recipient_province: string | null;
  occasion_id: string | null;
  budget_range_id: string | null;
  stage: string;
} | null;

/** Tab Lên đơn: danh mục định giá (SKU, combo, chính sách), địa chỉ giao, đơn và báo giá của khách. */
async function loadOrderSide(
  supabase: Db,
  me: Me,
  contactId: string,
  lead: LeadForOrder,
): Promise<OrderSide> {
  const canSeeProducts = me.permissions.has("product.view");
  const canSeeOrders = me.permissions.has("order.view_own") || me.permissions.has("order.view_all");
  const addressOwners = [...new Set([contactId, lead?.contact_id, lead?.recipient_contact_id])].filter(
    (x): x is string => Boolean(x),
  );
  const [loaded, addresses, orders, quotes, ctx] = await Promise.all([
    canSeeProducts ? loadCatalog(createAdminClient(), me.showroomId) : Promise.resolve(null),
    supabase
      .from("contact_addresses")
      .select("id, contact_id, receiver, street, ward, district, province, is_default")
      .in("contact_id", addressOwners)
      .order("is_default", { ascending: false }),
    canSeeOrders
      ? supabase
          .from("orders")
          .select("id, code, status, total, discount, created_at, order_items(sku, qty)")
          .or(`buyer_contact_id.eq.${contactId},recipient_contact_id.eq.${contactId}`)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),
    lead
      ? supabase
          .from("quotes")
          .select("id, code, status, total, token, valid_until, created_at, order_id")
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as never[] }),
    lead ? contextOf(lead.id, null) : Promise.resolve(null),
  ]);

  const missing: string[] = [];
  if (lead) {
    if (!lead.recipient_contact_id) missing.push("mua cho ai");
    if (!lead.recipient_province) missing.push("tỉnh người nhận");
    if (!lead.occasion_id) missing.push("dịp");
    if (!lead.budget_range_id) missing.push("ngân sách");
  }

  return {
    leadId: lead?.id ?? null,
    canCreate: !me.viewAs && me.permissions.has("order.create") && Boolean(lead) && lead?.stage !== "lost",
    canQuote: !me.viewAs && me.permissions.has("quote.create") && Boolean(lead) && lead?.stage !== "lost",
    missing,
    catalog: loaded?.catalog ?? null,
    products: loaded?.products ?? [],
    combos: loaded?.combos ?? [],
    context: ctx
      ? {
          showroomId: ctx.showroomId,
          buyerCountry: ctx.buyerCountry,
          customerTags: ctx.customerTags,
          recipientProvince: ctx.recipientProvince ?? null,
          sellerId: me.id,
          sellerRole: me.roleKey,
        }
      : null,
    addresses: (addresses.data ?? []).map((a) => ({
      id: a.id,
      province: a.province,
      label: [
        a.receiver,
        [a.street, a.ward, a.district, a.province].filter(Boolean).join(", "),
        a.contact_id === lead?.recipient_contact_id && a.contact_id !== lead?.contact_id
          ? "(người nhận)"
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    orders: (orders.data ?? []).map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      statusLabel: ORDER_STATUS[o.status] ?? o.status,
      total: o.total,
      discount: o.discount,
      at: noteTime.format(new Date(o.created_at)),
      items: o.order_items.map((i) => (i.qty > 1 ? `${i.qty} × ${i.sku}` : i.sku)).join(", "),
    })),
    quotes: (quotes.data ?? []).map((q) => ({
      id: q.id,
      code: q.code,
      status: q.status,
      total: q.total,
      token: q.token,
      orderId: q.order_id,
      validUntil: noteTime.format(new Date(q.valid_until)),
    })),
  };
}
