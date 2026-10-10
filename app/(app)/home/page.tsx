import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { HomeView } from "@/components/views/home";
import { requireAnyPermission, requireUser } from "@/lib/auth/session";
import { LEAD_VIEW, visibleTabs } from "@/lib/nav";
import { createClient } from "@/lib/db/server";

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
  const [{ data: leads }, { data: markets }] = await Promise.all([
    query,
    supabase.from("markets").select("country_code, name, color_token").eq("is_active", true),
  ]);

  return (
    <HomeView
      teamView={teamView}
      markets={markets ?? []}
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
