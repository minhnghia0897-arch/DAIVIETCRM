import type { Metadata } from "next";

import { SalesTargetsView } from "@/components/crm/views/sales-targets";
import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { currentMonth, parseMonth } from "@/lib/sales/credits";

import { copyPreviousTargets, setSalesTarget } from "../target-actions";

export const metadata: Metadata = { title: "Chỉ tiêu · Đại Việt CRM" };

// Chỉ tiêu doanh số tháng từng người (CLAUDE.md mục 9.3). Người đặt chỉ tiêu (target.manage) thấy và sửa mọi người;
// quản lý (kpi.team) chỉ xem người mình được xem (sales_kpi_month đã lọc).
export default async function Page({ searchParams }: PageProps<"/team/targets">) {
  const user = await requireAnyPermission(["target.manage", "kpi.team"]);
  const month = parseMonth((await searchParams).thang);
  const supabase = await createClient();
  const { data } = await supabase.rpc("sales_kpi_month", { p_month: month });
  return (
    <SalesTargetsView
      month={month}
      current={currentMonth()}
      rows={data ?? []}
      canEdit={user.permissions.has("target.manage") && !user.viewAs}
      actions={{ setSalesTarget, copyPreviousTargets }}
    />
  );
}
