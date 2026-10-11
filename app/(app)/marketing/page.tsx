import type { Metadata } from "next";

import { MarketingOverview, type OverviewRow } from "@/components/crm/views/marketing";
import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { MARKETING_VIEW } from "@/lib/nav";
import { vnToday } from "@/lib/team/attendance";

export const metadata: Metadata = { title: "Marketing · Đại Việt CRM" };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Tổng quan Marketing: số tổng hợp từ hàm marketing_overview (kiểm marketing.view ở database, không trả dữ liệu khách).
export default async function Page({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAnyPermission(MARKETING_VIEW);
  const { days: raw } = await searchParams;
  const days = [7, 30, 90].includes(Number(raw)) ? Number(raw) : 30;
  const today = vnToday(new Date());
  const supabase = await createClient();
  const [{ data }, { data: markets }] = await Promise.all([
    supabase.rpc("marketing_overview", { p_from: addDays(today, 1 - days), p_to: today }),
    supabase.from("markets").select("country_code, name").order("country_code"),
  ]);
  const rows: OverviewRow[] = (data ?? []).map((r) => ({
    kind: r.kind as OverviewRow["kind"],
    key: r.key ?? "unknown",
    label: r.label ?? "",
    leads: Number(r.leads),
    contacted: Number(r.contacted),
    converted: Number(r.converted),
    lost: Number(r.lost),
    spend: Number(r.spend),
    budget: Number(r.budget),
  }));
  return (
    <MarketingOverview
      rows={rows}
      days={days}
      markets={(markets ?? []).map((m) => ({ code: m.country_code, name: m.name }))}
    />
  );
}
