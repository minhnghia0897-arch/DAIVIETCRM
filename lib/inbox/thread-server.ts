import "server-only";

import type { LiveThread } from "@/components/crm/views/inbox-live";
import type { LiveSide, OrderSide } from "@/components/crm/views/inbox-live-side";
import { HANDOFF_LABEL } from "@/lib/ai/labels";
import type { SessionUser } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/db/admin";
import type { createClient } from "@/lib/db/server";
import { PROVINCE_NAMES } from "@/lib/geo/provinces";
import { parseAttachments } from "@/lib/integrations/attachments";
import { LEAD_STAGE_LABEL } from "@/lib/leads/labels";
import { loadCatalog } from "@/lib/sales/catalog-server";
import { contextOf } from "@/lib/sales/checkout-server";

import { extractFindings } from "./extract";

// Tải một hội thoại đang mở: tin nhắn và cột phải (hồ sơ khách, Lên đơn). Dùng chung cho trang Hội thoại (mở bằng
// link ?c=) và đường tải nhanh khi bấm chuyển hội thoại (app/api/inbox/thread). Mọi truy vấn chạy bằng phiên người
// dùng nên RLS lọc như trang; các nhóm truy vấn không phụ thuộc nhau chạy song song.

type Db = Awaited<ReturnType<typeof createClient>>;

export const CONV_SELECT =
  "id, channel, status, display_name, avatar_url, last_inbound_at, last_message_at, unread_count, lead_id, assigned_to, contact_id, ai_paused_at, ai_pause_reason, contacts(full_name, country_of_residence)";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ConvRow = {
  id: string;
  channel: string;
  lead_id: string | null;
  contact_id: string | null;
  contacts: { full_name: string; country_of_residence: string } | null;
};

export interface Opened<C extends ConvRow = ConvRow> {
  conv: C;
  thread: LiveThread;
  side: LiveSide | null;
}

/** Đọc hội thoại theo id (RLS kiểm người xem), rồi tin nhắn và cột phải song song. null khi không xem được. */
export async function loadOpened(supabase: Db, me: SessionUser, id: string) {
  const { data: conv } = await supabase.from("conversations").select(CONV_SELECT).eq("id", id).maybeSingle();
  if (!conv) return null;
  const threadP = loadThread(supabase, conv);
  const sideP = loadSide(supabase, conv, threadP, me);
  const [thread, side] = await Promise.all([threadP, sideP]);
  return { conv, thread, side } satisfies Opened<typeof conv>;
}

async function loadThread(supabase: Db, conv: ConvRow): Promise<LiveThread> {
  const [{ data: msgs }, { data: handoff }] = await Promise.all([
    supabase
      .from("messages")
      .select(
        "id, direction, text, attachments, status, error, sent_by, sent_via, tag, occurred_at, ai_run_id",
      )
      .eq("conversation_id", conv.id)
      .order("occurred_at", { ascending: true })
      .limit(300),
    // Lần AI chuyển cho người gần nhất (lý do, tóm tắt nhu cầu cho nhân viên).
    supabase
      .from("ai_runs")
      .select("handoff_reason, summary, started_at")
      .eq("conversation_id", conv.id)
      .eq("status", "handed_off")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const senders = [...new Set((msgs ?? []).map((m) => m.sent_by).filter((x): x is string => Boolean(x)))];
  const { data: staff } = senders.length
    ? await supabase.from("profiles").select("id, full_name").in("id", senders)
    : { data: [] as { id: string; full_name: string }[] };
  return {
    id: conv.id,
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
        (m.sent_via === "page" ? (conv.channel === "zalo" ? "Trên OA" : "Trên Page") : null),
      tag: m.tag === "HUMAN_AGENT" ? "Trả lời tay" : m.tag === "paid" ? "Tin tính phí" : null,
      ai: Boolean(m.ai_run_id),
    })),
    handoff: handoff
      ? {
          reason: HANDOFF_LABEL[handoff.handoff_reason ?? ""] ?? "AI chưa trả lời được",
          summary: handoff.summary,
          at: handoff.started_at,
        }
      : null,
  };
}

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
  threadP: Promise<LiveThread>,
  me: SessionUser,
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
  const l = lead.data;
  const [{ data: people }, order, thread] = await Promise.all([
    authors.length
      ? supabase.from("profiles").select("id, full_name").in("id", authors)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    loadOrderSide(supabase, me, contactId, l),
    threadP,
  ]);
  const canEdit =
    !me.viewAs &&
    (me.permissions.has("lead.edit_all") ||
      (me.permissions.has("lead.edit_own") && l?.assigned_to === me.id));

  const inbound = thread.messages
    .filter((m) => !m.out && m.text)
    .map((m) => [m.text!, noteTime.format(new Date(m.at))] as [string, string]);

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
  me: SessionUser,
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
    // Sản phẩm chỉ làm quà tặng không bán lẻ: chỉ hiện ở dòng quà tặng kèm.
    products: (loaded?.products ?? []).filter((p) => !loaded?.catalog.variants[p.variantId]?.giftOnly),
    gifts: loaded?.gifts ?? [],
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
