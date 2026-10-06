import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LeadLive, type LiveLeadData } from "@/components/crm/views/lead-live";
import { requireAnyPermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { describeEvent, TASK_TYPE_LABEL } from "@/lib/leads/activity";
import { callbackSlots, marketWindowsFromDb } from "@/lib/leads/callback-slots";
import { leadSourceLabel } from "@/lib/leads/labels";
import { localTime } from "@/lib/leads/windows";
import { LEAD_VIEW } from "@/lib/nav";
import { formatDue } from "@/lib/tasks/view";

import {
  addImportantDate,
  addNote,
  logCall,
  markLost,
  moveToDemo,
  revealPhone,
  setBuyerMarket,
  setRecipient,
  updateLeadInfo,
} from "./actions";

export const metadata: Metadata = { title: "Hồ sơ lead · Đại Việt CRM" };

// Hồ sơ lead đọc database dưới phiên người đang đăng nhập: RLS trả lead chỉ khi người đó được xem (lead của mình,
// hoặc mọi lead khi có lead.view_all). Số điện thoại chỉ có bản che; số đầy đủ lấy qua nút Gọi (reveal_identity).
export default async function Page({ params }: PageProps<"/leads/[id]">) {
  const user = await requireAnyPermission(LEAD_VIEW);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const now = new Date();

  // prettier-ignore
  const { data: lead } = await supabase
    .from("leads")
    .select("id, stage, source, keep_surprise, recipient_province, occasion_id, occasion_date, budget_range_id, assigned_to, first_contact_at, sla_due_at, window_wait_until, created_at, contact_id, recipient_contact_id, buyer:contacts!leads_contact_id_fkey(id, full_name, country_of_residence, city), recipient:contacts!leads_recipient_contact_id_fkey(id, full_name, relation_in_household), owner:profiles!leads_assigned_to_fkey(full_name), lost:lost_reasons(label)")
    .eq("id", id)
    .maybeSingle();
  if (!lead || !lead.buyer) notFound();

  const contactIds = [lead.contact_id, lead.recipient_contact_id].filter(Boolean) as string[];
  const [identities, occasions, budgets, outcomes, lostReasons, markets, events, tasks, dates] =
    await Promise.all([
      supabase
        .from("contact_identity_display")
        .select("id, contact_id, type, display_masked, is_primary, is_valid")
        .in("contact_id", contactIds),
      supabase.from("occasions").select("id, label").eq("is_active", true).order("sort"),
      supabase.from("budget_ranges").select("id, label").eq("is_active", true).order("sort"),
      supabase.from("call_outcomes").select("key, label").eq("is_active", true).order("sort"),
      supabase.from("lost_reasons").select("key, label").eq("is_active", true).order("sort"),
      supabase
        .from("markets")
        .select("country_code, name, timezone, call_windows")
        .eq("is_active", true)
        .order("sort"),
      supabase
        .from("activities")
        .select("id, type, occurred_at, actor_type, actor_id, payload")
        .eq("lead_id", id)
        .order("occurred_at", { ascending: false })
        .limit(100),
      supabase
        .from("tasks")
        .select("id, type, title, due_at, assigned_to")
        .eq("lead_id", id)
        .eq("status", "open")
        .order("due_at"),
      supabase
        .from("important_dates")
        .select("id, contact_id, type, date")
        .in("contact_id", contactIds)
        .order("date"),
    ]);

  // Tên người trong dòng hoạt động và trong payload giao lead.
  const peopleIds = new Set<string>();
  for (const e of events.data ?? []) {
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

  const activity = (events.data ?? []).map((e) => {
    const line = describeEvent(e.type ?? "", (e.payload ?? {}) as Record<string, unknown>, { names, now });
    return {
      id: String(e.id),
      ...line,
      actor: e.actor_type === "system" ? "Hệ thống" : (names.get(e.actor_id ?? "") ?? ""),
      time: formatDue(e.occurred_at ?? now, now),
    };
  });

  // Ảnh gửi từ Telegram nằm trong kho riêng tư: chỉ ký link ngắn hạn cho ảnh của sự kiện người này đã đọc được
  // qua RLS ở trên, nên không mở thêm quyền nào.
  const files = activity.filter((a) => a.file).slice(0, 20);
  if (files.length) {
    const { data: signed } = await createAdminClient()
      .storage.from("telegram-attachments")
      .createSignedUrls(
        files.map((a) => a.file!),
        600,
      );
    const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const a of activity) if (a.file) a.file = urlOf.get(a.file) ?? undefined;
  }

  const country = lead.buyer.country_of_residence;
  const market = (markets.data ?? []).find((m) => m.country_code === country);
  const slots = market
    ? callbackSlots(now, marketWindowsFromDb(market.timezone, market.call_windows))
    : callbackSlots(now, marketWindowsFromDb("Asia/Ho_Chi_Minh", vnFallback(markets.data ?? [])));
  const mine = lead.assigned_to === user.id;

  const sla = (() => {
    if (lead.stage === "won" || lead.stage === "lost" || lead.first_contact_at) return null;
    if (lead.window_wait_until && new Date(lead.window_wait_until) > now)
      return {
        tone: "n" as const,
        text: `Gọi lúc ${localTime(new Date(lead.window_wait_until), market?.timezone ?? "Asia/Ho_Chi_Minh")}${market && market.country_code !== "VN" ? ` giờ ${market.name}` : ""}`,
      };
    if (!lead.sla_due_at) return null;
    const mins = Math.round((new Date(lead.sla_due_at).getTime() - now.getTime()) / 60_000);
    return mins < 0
      ? { tone: "err" as const, text: `Quá hạn SLA ${-mins} phút` }
      : { tone: "warn" as const, text: `Còn ${mins} phút để gọi` };
  })();

  const identity = (contactId: string | null) =>
    (identities.data ?? [])
      .filter((i) => i.contact_id === contactId && i.type === "phone")
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0] ?? null;
  const buyerPhone = identity(lead.contact_id);
  const self = lead.recipient_contact_id !== null && lead.recipient_contact_id === lead.contact_id;
  const recipientPhone = self ? null : identity(lead.recipient_contact_id);

  const data: LiveLeadData = {
    id: lead.id,
    stage: lead.stage,
    sourceLabel: leadSourceLabel(lead.source),
    lostLabel: lead.lost?.label ?? null,
    ownerName: lead.owner?.full_name ?? null,
    mine,
    sla,
    buyer: {
      id: lead.buyer.id,
      name: lead.buyer.full_name,
      country,
      city: lead.buyer.city,
      phoneMasked: buyerPhone?.display_masked ?? null,
      phoneIdentityId: buyerPhone?.id ?? null,
      phoneInvalid: buyerPhone ? !buyerPhone.is_valid : false,
    },
    buyFor: lead.recipient_contact_id === null ? null : self ? "self" : "other",
    recipient:
      lead.recipient && !self
        ? {
            id: lead.recipient.id,
            name: lead.recipient.full_name,
            relation: lead.recipient.relation_in_household,
            // Giữ bất ngờ: không hiện cả bản che của số người nhận (CLAUDE.md mục 4, leads.keep_surprise).
            phoneMasked: lead.keep_surprise ? null : (recipientPhone?.display_masked ?? null),
          }
        : null,
    recipientProvince: lead.recipient_province,
    occasionId: lead.occasion_id,
    occasionDate: lead.occasion_date,
    budgetRangeId: lead.budget_range_id,
    keepSurprise: lead.keep_surprise,
    catalogs: {
      occasions: occasions.data ?? [],
      budgets: budgets.data ?? [],
      outcomes: outcomes.data ?? [],
      lostReasons: lostReasons.data ?? [],
      markets: (markets.data ?? []).map((m) => ({ code: m.country_code, name: m.name })),
    },
    callbackSlots: slots,
    tasks: (tasks.data ?? []).map((t) => ({
      id: t.id,
      label: `${TASK_TYPE_LABEL[t.type] ?? "Việc"}: ${t.title}`,
      due: formatDue(t.due_at, now),
      overdue: new Date(t.due_at) < now,
    })),
    dates: (dates.data ?? []).map((d) => ({
      id: d.id,
      label: d.type,
      date: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`,
      who: d.contact_id === lead.contact_id ? lead.buyer!.full_name : (lead.recipient?.full_name ?? ""),
    })),
    activity,
  };

  return (
    <LeadLive
      data={data}
      actions={{
        revealPhone,
        logCall,
        addNote,
        updateLeadInfo,
        setBuyerMarket,
        setRecipient,
        moveToDemo,
        markLost,
        addImportantDate,
      }}
    />
  );
}

/** Thị trường chưa xác nhận: gợi ý giờ theo khung VN. */
function vnFallback(markets: { country_code: string; call_windows: unknown }[]) {
  return markets.find((m) => m.country_code === "VN")?.call_windows ?? [];
}
