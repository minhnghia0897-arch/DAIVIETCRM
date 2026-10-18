import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CustomerLive, type CustomerLiveData } from "@/components/crm/views/customer-live";
import { requireAnyPermission } from "@/lib/auth/session";
import { lifecycleOf } from "@/lib/cdp/lifecycle";
import { createClient } from "@/lib/db/server";
import { describeEvent, TASK_TYPE_LABEL } from "@/lib/leads/activity";
import { LEAD_STAGE_LABEL, leadSourceLabel } from "@/lib/leads/labels";
import { CUSTOMER_VIEW } from "@/lib/nav";
import { formatDue } from "@/lib/tasks/view";

import {
  addCustomerDate,
  exportCustomerData,
  openCustomerLead,
  removeCustomerDate,
  renameCustomer,
  revealCustomerPhone,
  setCustomerConsent,
  updateCustomerProfile,
} from "./actions";

export const metadata: Metadata = { title: "Hồ sơ khách · Đại Việt CRM" };

const IDENTITY_LABEL: Record<string, string> = {
  phone: "Điện thoại",
  zalo_user_id: "Zalo",
  fb_psid: "Messenger",
  email: "Email",
  tiktok: "TikTok",
};

// Hồ sơ khách 360 (CLAUDE.md 1.1, DESIGN.md 6.15) đọc database dưới phiên người đang đăng nhập: RLS chỉ trả khách
// thuộc lead hoặc đơn người đó được xem. Số điện thoại: database trả số đầy đủ cho người được xem (contact.phone_reveal,
// hoặc lead đang giao cho mình), còn lại bản che; nút Gọi vẫn qua reveal_identity và ghi nhật ký.
export default async function Page({ params }: PageProps<"/customers/[id]">) {
  const user = await requireAnyPermission(CUSTOMER_VIEW);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const now = new Date();

  const [{ data: row }, { data: contact }] = await Promise.all([
    supabase
      .from("customer_list")
      .select(
        "id, full_name, relation_in_household, country_of_residence, province, household_id, lifecycle_stage, stage_since, last_interaction_at, owned_products, flags, total_paid, orders_count, owner_name",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("contacts").select("city, created_at, contact_via_contact_id").eq("id", id).maybeSingle(),
  ]);
  if (!row || !contact) notFound();

  const [identities, consents, leads, orders, dates, tasks, conversations, markets, household, members] =
    await Promise.all([
      supabase
        .from("contact_identity_display")
        .select("id, type, display, is_primary, is_valid")
        .eq("contact_id", id)
        .order("is_primary", { ascending: false }),
      supabase
        .from("consents")
        .select("purpose, channel, granted, granted_at, withdrawn_at, source")
        .eq("contact_id", id)
        .order("granted_at", { ascending: false }),
      supabase
        .from("leads")
        .select(
          "id, stage, source, created_at, assigned_to, keep_surprise, contact_id, recipient_contact_id, owner:profiles!leads_assigned_to_fkey(full_name)",
        )
        .or(`contact_id.eq.${id},recipient_contact_id.eq.${id}`)
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select(
          "id, code, status, total, paid_amount, created_at, buyer_contact_id, recipient_contact_id, keep_surprise",
        )
        .or(`buyer_contact_id.eq.${id},recipient_contact_id.eq.${id}`)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("important_dates")
        .select("id, type, date, recurring_yearly")
        .eq("contact_id", id)
        .order("date"),
      supabase
        .from("tasks")
        .select("id, type, title, due_at, assignee:profiles!tasks_assigned_to_fkey(full_name)")
        .eq("contact_id", id)
        .eq("status", "open")
        .order("due_at"),
      supabase
        .from("conversations")
        .select("id, channel, last_message_at, assigned_to, lead_id")
        .eq("contact_id", id)
        .order("last_message_at", { ascending: false, nullsFirst: false }),
      supabase.from("markets").select("country_code, name, color_token").eq("is_active", true).order("sort"),
      row.household_id
        ? supabase.from("households").select("id, display_name").eq("id", row.household_id).maybeSingle()
        : Promise.resolve({ data: null }),
      row.household_id
        ? supabase
            .from("customer_list")
            .select("id, full_name, relation_in_household, country_of_residence, lifecycle_stage")
            .eq("household_id", row.household_id)
            .neq("id", id)
        : Promise.resolve({ data: [] }),
    ]);

  const leadIds = (leads.data ?? []).map((l) => l.id);
  const orderIds = (orders.data ?? []).map((o) => o.id);
  const scope = [
    `contact_id.eq.${id}`,
    leadIds.length ? `lead_id.in.(${leadIds.join(",")})` : null,
    orderIds.length ? `order_id.in.(${orderIds.join(",")})` : null,
  ]
    .filter(Boolean)
    .join(",");
  const { data: events } = await supabase
    .from("activities")
    .select("id, type, occurred_at, actor_type, actor_id, payload")
    .or(scope)
    .order("occurred_at", { ascending: false })
    .limit(80);

  // Tên người trong dòng sự kiện và trong payload giao lead.
  const peopleIds = new Set<string>();
  for (const e of events ?? []) {
    if (e.actor_id) peopleIds.add(e.actor_id);
    const p = (e.payload ?? {}) as Record<string, unknown>;
    for (const k of ["to", "from"]) if (typeof p[k] === "string") peopleIds.add(p[k] as string);
  }
  const { data: people } = peopleIds.size
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", [...peopleIds])
    : { data: [] as { id: string; full_name: string }[] };
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  const activity = (events ?? []).map((e) => {
    const line = describeEvent(e.type ?? "", (e.payload ?? {}) as Record<string, unknown>, { names, now });
    return {
      id: String(e.id),
      kind: line.kind,
      text: line.text,
      actor:
        e.actor_type === "system"
          ? "Hệ thống"
          : e.actor_type === "ai"
            ? "Trợ lý AI"
            : e.actor_type === "customer"
              ? "Khách"
              : (names.get(e.actor_id ?? "") ?? ""),
      time: formatDue(e.occurred_at ?? now, now),
    };
  });

  const openLeads = (leads.data ?? []).filter((l) => l.stage !== "won" && l.stage !== "lost");
  const OPEN_ORDER = ["completed", "cancelled", "returned"];
  // Giữ bất ngờ: chỉ là gợi ý trên giao diện; server chặn lại ở revealCustomerPhone.
  const surprise =
    (leads.data ?? []).some(
      (l) => l.keep_surprise && l.recipient_contact_id === id && l.contact_id !== id && openLeads.includes(l),
    ) ||
    (orders.data ?? []).some(
      (o) =>
        o.keep_surprise &&
        o.recipient_contact_id === id &&
        o.buyer_contact_id !== id &&
        !OPEN_ORDER.includes(o.status),
    );
  // Lead đang giao cho mình có khách này: được xem số để gọi (contact.phone_reveal_assigned, như reveal_identity).
  const holdsOpenLead = openLeads.some(
    (l) => l.assigned_to === user.id && (l.contact_id === id || !l.keep_surprise),
  );
  const holdsAnyLead = (leads.data ?? []).some((l) => l.assigned_to === user.id);
  // Cùng luật với database (assert_contact_editor): giữ lead của khách, hoặc đang trả lời khách đang hỏi.
  const conversationAssigned = (conversations.data ?? []).some(
    (c) => !c.lead_id && c.assigned_to === user.id,
  );
  const lc = lifecycleOf(row.lifecycle_stage);

  const data: CustomerLiveData = {
    id,
    name: row.full_name ?? "Khách",
    relation: row.relation_in_household,
    market: row.country_of_residence ?? "unknown",
    province: row.province,
    city: contact.city,
    stage: row.lifecycle_stage ?? "stranger",
    stageLabel: lc.label,
    stageSince: row.stage_since,
    flags: row.flags ?? [],
    lastInteraction: row.last_interaction_at,
    createdAt: contact.created_at,
    ownerName: row.owner_name,
    totalPaid: row.total_paid ?? 0,
    ordersCount: row.orders_count ?? 0,
    owned: ownedList(row.owned_products),
    sharedPhone: Boolean(contact.contact_via_contact_id),
    identities: (identities.data ?? []).map((i) => ({
      id: i.id!,
      type: i.type!,
      label: IDENTITY_LABEL[i.type ?? ""] ?? "Định danh",
      display: i.display ?? "",
      primary: Boolean(i.is_primary),
      valid: i.is_valid !== false,
    })),
    consents: (consents.data ?? []).map((c) => ({ ...c, source: c.source })),
    leads: (leads.data ?? []).map((l) => ({
      id: l.id,
      stage: LEAD_STAGE_LABEL[l.stage] ?? l.stage,
      closed: l.stage === "won" || l.stage === "lost",
      lost: l.stage === "lost",
      source: leadSourceLabel(l.source),
      role: l.contact_id === id ? "buyer" : "recipient",
      owner: l.owner?.full_name ?? null,
      createdAt: l.created_at,
    })),
    orders: (orders.data ?? []).map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      total: o.total,
      paid: o.paid_amount,
      role: o.buyer_contact_id === id ? "buyer" : "recipient",
      createdAt: o.created_at,
    })),
    household: household.data ? { id: household.data.id, name: household.data.display_name } : null,
    members: (members.data ?? []).map((m) => ({
      id: m.id!,
      name: m.full_name ?? "Khách",
      relation: m.relation_in_household,
      market: m.country_of_residence ?? "unknown",
      stageLabel: lifecycleOf(m.lifecycle_stage).label,
    })),
    dates: (dates.data ?? []).map((d) => ({
      id: d.id,
      label: d.type,
      date: d.date,
      yearly: d.recurring_yearly,
    })),
    tasks: (tasks.data ?? []).map((t) => ({
      id: t.id,
      label: `${TASK_TYPE_LABEL[t.type] ?? "Việc"}: ${t.title}`,
      due: formatDue(t.due_at, now),
      overdue: new Date(t.due_at) < now,
      assignee: t.assignee?.full_name ?? null,
    })),
    conversationId: conversations.data?.[0]?.id ?? null,
    openLeadId: openLeads.find((l) => l.contact_id === id)?.id ?? null,
    mine: holdsAnyLead || conversationAssigned,
    holdsOpenLead,
    surprise,
    markets: markets.data ?? [],
    activity,
  };

  return (
    <CustomerLive
      data={data}
      actions={{
        revealPhone: revealCustomerPhone,
        rename: renameCustomer,
        updateProfile: updateCustomerProfile,
        setConsent: setCustomerConsent,
        addDate: addCustomerDate,
        removeDate: removeCustomerDate,
        openLead: openCustomerLead,
        exportData: exportCustomerData,
      }}
    />
  );
}

/** Sản phẩm đang dùng (customer_lifecycle.owned_products): tên, serial, hạn bảo hành, số lượng. */
function ownedList(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x) => ({
      name: String(x.name ?? ""),
      serial: typeof x.serial === "string" ? x.serial : null,
      warrantyEnds: typeof x.warranty_ends === "string" ? x.warranty_ends : null,
      qty: typeof x.qty === "number" ? x.qty : null,
    }))
    .filter((x) => x.name);
}
