import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SalesTeamView } from "@/components/crm/views/sales-kpi";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { currentMonth, parseMonth } from "@/lib/sales/credits";

export const metadata: Metadata = { title: "Đội ngũ · Đại Việt CRM" };

// Tổng quan đội: doanh số đã cọc từng người trong tháng so với chỉ tiêu (sales_kpi_month). Hàm database chỉ trả người
// người xem được: quản lý (kpi.team) không thấy Owner, sale admin khác; người đặt chỉ tiêu thấy mọi người.
export default async function Page({ searchParams }: PageProps<"/team">) {
  const user = await requireUser();
  const month = parseMonth((await searchParams).thang);
  if (!user.permissions.has("kpi.team")) redirect(`/team/people/${user.id}?thang=${month.slice(0, 7)}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("sales_kpi_month", { p_month: month });
  return (
    <SalesTeamView
      month={month}
      current={currentMonth()}
      rows={data ?? []}
      meId={user.id}
      showNames={user.permissions.has("kpi.leaderboard")}
    />
  );
}
