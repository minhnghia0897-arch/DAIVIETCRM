import type { Metadata } from "next";

import { LeadList, type LeadListRow, type LeadView } from "@/components/crm/views/lead-list";
import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { leadSourceLabel, LEAD_STAGE_LABEL } from "@/lib/leads/labels";
import { localTime } from "@/lib/leads/windows";
import { LEAD_VIEW } from "@/lib/nav";

import { assignLeads, createLead } from "./actions";
import { checkImportPhones, importLeads } from "./import-actions";

export const metadata: Metadata = { title: "Lead · Đại Việt CRM" };

const VIEWS: LeadView[] = ["mine", "open", "unassigned", "overdue", "waiting", "closed"];
const TEAM_VIEWS: LeadView[] = ["open", "unassigned", "waiting"];
const LIMIT = 200;

// Danh sách lead (CLAUDE.md 11.1, DESIGN.md 5.10). Đọc dưới phiên người dùng: RLS chỉ trả lead người đó được xem.
// Bộ lọc nằm trên URL để chia sẻ được.
export default async function Page({ searchParams }: PageProps<"/leads">) {
  const user = await requireAnyPermission(LEAD_VIEW);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const teamView = user.permissions.has("lead.view_all");
  const canAssign = user.permissions.has("lead.assign");
  const asked = one("view") as LeadView;
  // Không xem được mọi lead thì các góc nhìn của đội (đang mở, chưa phân, chờ khung) không có nghĩa: về lead của mình.
  const view: LeadView = !VIEWS.includes(asked)
    ? teamView
      ? "open"
      : "mine"
    : !teamView && TEAM_VIEWS.includes(asked)
      ? "mine"
      : asked;
  const stage = one("stage");
  const market = one("market");
  const sourceKey = one("source");
  const q = one("q").trim().slice(0, 80);
  const now = new Date();
  const nowIso = now.toISOString();

  const supabase = await createClient();
  let query = supabase
    .from("leads")
    .select(
      "id, stage, source, source_detail, sla_due_at, first_contact_at, window_wait_until, assigned_to, created_at, flags, buyer:contacts!leads_contact_id_fkey!inner(full_name, country_of_residence), owner:profiles!leads_assigned_to_fkey(full_name)",
      { count: "exact" },
    );
  if (view === "closed") query = query.in("stage", ["won", "lost"]);
  else query = query.not("stage", "in", "(won,lost)");
  if (view === "mine") query = query.eq("assigned_to", user.id);
  if (view === "unassigned") query = query.is("assigned_to", null).is("window_wait_until", null);
  if (view === "waiting") query = query.gt("window_wait_until", nowIso);
  if (view === "overdue")
    query = query.is("first_contact_at", null).not("assigned_to", "is", null).lt("sla_due_at", nowIso);
  if (stage && LEAD_STAGE_LABEL[stage]) query = query.eq("stage", stage);
  if (market) query = query.eq("buyer.country_of_residence", market);
  if (sourceKey) query = query.eq("source_detail->>source_key", sourceKey);
  if (q) query = query.ilike("buyer.full_name", `%${q.replace(/[%_]/g, "")}%`);
  query =
    view === "closed"
      ? query.order("updated_at", { ascending: false })
      : query
          .order("sla_due_at", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false });

  const counted = (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) =>
    build(base()).then((r) => r.count ?? 0);
  function base() {
    return supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("stage", "in", "(won,lost)");
  }

  const [list, markets, sources, assignees, nUnassigned, nOverdue, nWaiting, nMine] = await Promise.all([
    query.limit(LIMIT),
    supabase
      .from("markets")
      .select("country_code, name, timezone, color_token")
      .eq("is_active", true)
      .order("sort"),
    supabase.from("lead_sources").select("key, label").eq("is_active", true).order("sort"),
    canAssign ? supabase.rpc("lead_assignees") : Promise.resolve({ data: [] as never[] }),
    teamView ? counted((b) => b.is("assigned_to", null).is("window_wait_until", null)) : Promise.resolve(0),
    counted((b) => {
      const x = b.is("first_contact_at", null).not("assigned_to", "is", null).lt("sla_due_at", nowIso);
      return teamView ? x : x.eq("assigned_to", user.id);
    }),
    teamView ? counted((b) => b.gt("window_wait_until", nowIso)) : Promise.resolve(0),
    counted((b) => b.eq("assigned_to", user.id)),
  ]);

  const tzOf = new Map((markets.data ?? []).map((m) => [m.country_code, m]));
  const sourceLabel = new Map((sources.data ?? []).map((s) => [s.key, s.label]));

  const rows: LeadListRow[] = (list.data ?? []).map((l) => {
    const buyer = Array.isArray(l.buyer) ? l.buyer[0] : l.buyer;
    const owner = Array.isArray(l.owner) ? l.owner[0] : l.owner;
    const m = tzOf.get(buyer?.country_of_residence ?? "");
    const key = ((l.source_detail ?? {}) as { source_key?: string }).source_key;
    const sla = (() => {
      if (l.stage === "won" || l.stage === "lost") return null;
      if (l.window_wait_until && new Date(l.window_wait_until) > now)
        return {
          tone: "ai" as const,
          text: `Gọi lúc ${localTime(new Date(l.window_wait_until), m?.timezone ?? "Asia/Ho_Chi_Minh")}${m && m.country_code !== "VN" ? ` giờ ${m.name}` : ""}`,
        };
      if (l.first_contact_at) return { tone: "ok" as const, text: "Đã liên hệ" };
      if (!l.assigned_to) return { tone: "warn" as const, text: "Chưa phân" };
      if (!l.sla_due_at) return null;
      const mins = Math.round((new Date(l.sla_due_at).getTime() - now.getTime()) / 60_000);
      return mins < 0
        ? { tone: "err" as const, text: `Quá ${-mins} phút` }
        : { tone: mins < 2 ? ("warn" as const) : ("n" as const), text: `Còn ${mins} phút` };
    })();
    return {
      id: l.id,
      name: buyer?.full_name ?? "",
      market: buyer?.country_of_residence ?? "unknown",
      localTime: m && m.country_code !== "VN" ? localTime(now, m.timezone) : null,
      source: (key && sourceLabel.get(key)) || leadSourceLabel(l.source),
      stage: LEAD_STAGE_LABEL[l.stage] ?? l.stage,
      sla,
      ownerName: owner?.full_name ?? null,
      phoneInvalid: (l.flags ?? []).includes("phone_invalid"),
    };
  });

  return (
    <LeadList
      view={view}
      filters={{ stage, market, source: sourceKey, q }}
      rows={rows}
      total={list.count ?? rows.length}
      limit={LIMIT}
      teamView={teamView}
      counts={{ unassigned: nUnassigned, overdue: nOverdue, waiting: nWaiting, mine: nMine }}
      markets={(markets.data ?? []).map((m) => ({
        country_code: m.country_code,
        name: m.name,
        color_token: m.color_token,
      }))}
      sources={sources.data ?? []}
      assignees={(assignees.data ?? []).map(
        (a: { id: string; full_name: string; receives: boolean; uncontacted: number }) => ({
          id: a.id,
          name: a.full_name,
          receives: a.receives,
          uncontacted: Number(a.uncontacted),
        }),
      )}
      actions={{ createLead, assignLeads, checkImportPhones, importLeads }}
    />
  );
}
