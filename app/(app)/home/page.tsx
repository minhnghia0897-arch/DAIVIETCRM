import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { HomeView } from "@/components/views/home";
import { requireAnyPermission, requireUser } from "@/lib/auth/session";
import { LEAD_VIEW, visibleTabs } from "@/lib/nav";
import { createClient } from "@/lib/db/server";
import { currentMonth } from "@/lib/sales/credits";

export const metadata: Metadata = { title: "Trang chủ · Đại Việt CRM" };

export default async function HomePage() {
  // Vai trò không làm việc với lead (Marketing…): trang chủ là khu đầu tiên mình được mở.
  const me = await requireUser();
  if (!LEAD_VIEW.some((p) => me.permissions.has(p))) {
    const first = visibleTabs(me.permissions).find((t) => t.href !== "/home" && t.anyOf.length > 0);
    if (first) redirect(first.href);
  }
  const user = await requireAnyPermission(LEAD_VIEW);
  const supabase = await createClient();
  const teamView = user.permissions.has("lead.view_all");

  let query = supabase
    .from("leads")
    .select(
      "id, stage, sla_due_at, first_contact_at, assigned_to, contacts!leads_contact_id_fkey(full_name, country_of_residence), profiles(full_name)",
    )
    .not("stage", "in", "(won,lost)")
    .order("sla_due_at", { ascending: true, nullsFirst: false })
    .limit(50);
  if (!teamView) query = query.eq("assigned_to", user.id);
  // Doanh số của chính mình tháng này (sổ sales_credits, chỉ tiêu targets): người bán thấy ngay mình được bao nhiêu.
  const month = currentMonth();
  const showSales = user.permissions.has("kpi.own") && user.permissions.has("order.create");
  const [{ data: leads }, { data: markets }, credits, target] = await Promise.all([
    query,
    supabase.from("markets").select("country_code, name, color_token").eq("is_active", true),
    showSales
      ? supabase.from("sales_credits").select("kind, amount").eq("seller_id", user.id).eq("month", month)
      : Promise.resolve({ data: null }),
    showSales
      ? supabase
          .from("targets")
          .select("target_value")
          .eq("user_id", user.id)
          .eq("period", "month")
          .eq("period_start", month)
          .eq("metric_key", "revenue_deposit")
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <HomeView
      teamView={teamView}
      markets={markets ?? []}
      sales={
        showSales
          ? {
              userId: user.id,
              month,
              net: (credits.data ?? []).reduce((n, c) => n + c.amount, 0),
              orders: (credits.data ?? []).filter((c) => c.kind === "sale").length,
              target: target.data?.target_value ?? null,
              team: user.permissions.has("kpi.team"),
            }
          : null
      }
      now={new Date()}
      rows={(leads ?? []).map((l) => ({
        id: l.id,
        stage: l.stage,
        slaDueAt: l.sla_due_at,
        firstContactAt: l.first_contact_at,
        assignedTo: l.assigned_to,
        contactName: l.contacts?.full_name ?? "",
        market: l.contacts?.country_of_residence ?? "unknown",
        assigneeName: l.profiles?.full_name ?? null,
      }))}
    />
  );
}
