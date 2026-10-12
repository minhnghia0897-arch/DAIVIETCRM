import "server-only";

import type { BoardCard, BoardData } from "@/components/crm/views/lead-board";
import type { SessionUser } from "@/lib/auth/types";
import { createClient } from "@/lib/db/server";
import { leadSourceLabel } from "@/lib/leads/labels";
import { boardSlaBadge } from "@/lib/leads/sla-badge";
import { missingInfo } from "@/lib/leads/stages";

const LIMIT = 600;
/** Cột Chốt đơn, Thất bại chỉ giữ lead đóng trong chừng này ngày để bảng gọn. */
export const CLOSED_DAYS = 30;

// Bảng Kanban lead (Owner chốt 12/10/2026: lead chính là cơ hội, xem theo giai đoạn ngay trong menu Lead). Đọc dưới
// phiên người dùng: RLS chỉ trả lead người đó được xem. Giá trị thẻ lấy từ đơn đang có của lead, chưa có đơn thì báo
// giá gần nhất.
export async function loadBoard(
  user: SessionUser,
  f: { mine: boolean; market: string; source: string; q: string },
  now: Date,
): Promise<BoardData> {
  const supabase = await createClient();
  const since = new Date(now.getTime() - CLOSED_DAYS * 86_400_000).toISOString();
  let query = supabase
    .from("leads")
    .select(
      "id, stage, source, source_detail, assigned_to, first_contact_at, sla_due_at, window_wait_until, updated_at, flags, recipient_contact_id, recipient_province, occasion_id, budget_range_id, buyer:contacts!leads_contact_id_fkey!inner(full_name, country_of_residence), owner:profiles!leads_assigned_to_fkey(full_name)",
      { count: "exact" },
    )
    .or(`stage.not.in.(won,lost),updated_at.gte.${since}`);
  if (f.mine) query = query.eq("assigned_to", user.id);
  if (f.market) query = query.eq("buyer.country_of_residence", f.market);
  if (f.source) query = query.eq("source_detail->>source_key", f.source);
  if (f.q) query = query.ilike("buyer.full_name", `%${f.q.replace(/[%_]/g, "")}%`);

  const [list, markets, sources, lostReasons] = await Promise.all([
    query.order("updated_at", { ascending: false }).limit(LIMIT),
    supabase
      .from("markets")
      .select("country_code, name, timezone, color_token")
      .eq("is_active", true)
      .order("sort"),
    supabase.from("lead_sources").select("key, label").eq("is_active", true).order("sort"),
    supabase.from("lost_reasons").select("key, label").eq("is_active", true).order("sort"),
  ]);
  const leads = list.data ?? [];
  const ids = leads.map((l) => l.id);
  const [quotes, orders] = ids.length
    ? await Promise.all([
        supabase
          .from("quotes")
          .select("lead_id, total, created_at")
          .in("lead_id", ids)
          .not("status", "in", "(rejected,expired)")
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("lead_id, total, created_at")
          .in("lead_id", ids)
          .is("deleted_at", null)
          .not("status", "in", "(cancelled,draft)")
          .order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  // Giá trị: tổng các đơn đang có của lead; chưa có đơn thì báo giá gần nhất.
  const orderValue = new Map<string, number>();
  for (const o of orders.data ?? [])
    if (o.lead_id) orderValue.set(o.lead_id, (orderValue.get(o.lead_id) ?? 0) + o.total);
  const quoteValue = new Map<string, number>();
  for (const q of quotes.data ?? []) if (!quoteValue.has(q.lead_id)) quoteValue.set(q.lead_id, q.total);

  const tzOf = new Map((markets.data ?? []).map((m) => [m.country_code, m]));
  const sourceLabel = new Map((sources.data ?? []).map((s) => [s.key, s.label]));
  const editAll = user.permissions.has("lead.edit_all");
  const editOwn = user.permissions.has("lead.edit_own");

  const cards: BoardCard[] = leads.map((l) => {
    const buyer = Array.isArray(l.buyer) ? l.buyer[0] : l.buyer;
    const owner = Array.isArray(l.owner) ? l.owner[0] : l.owner;
    const key = ((l.source_detail ?? {}) as { source_key?: string }).source_key;
    const open = l.stage !== "won" && l.stage !== "lost";
    return {
      id: l.id,
      stage: l.stage,
      name: buyer?.full_name ?? "",
      market: buyer?.country_of_residence ?? "unknown",
      source: (key && sourceLabel.get(key)) || leadSourceLabel(l.source),
      ownerName: owner?.full_name ?? null,
      value: orderValue.get(l.id) ?? quoteValue.get(l.id) ?? null,
      sla: open ? boardSlaBadge(l, tzOf.get(buyer?.country_of_residence ?? ""), now) : null,
      missing: l.stage === "new" || l.stage === "contacted" ? missingInfo(l) : [],
      phoneInvalid: (l.flags ?? []).includes("phone_invalid"),
      // Cùng luật với database (sửa mọi lead, hoặc lead mình đang giữ); database vẫn kiểm lại khi chuyển.
      editable: open && (editAll || (editOwn && l.assigned_to === user.id)),
      updatedAt: l.updated_at,
    };
  });

  return {
    cards,
    total: list.count ?? cards.length,
    limit: LIMIT,
    closedDays: CLOSED_DAYS,
    markets: (markets.data ?? []).map((m) => ({
      country_code: m.country_code,
      name: m.name,
      color_token: m.color_token,
    })),
    sources: sources.data ?? [],
    lostReasons: lostReasons.data ?? [],
  };
}
