import type { Metadata } from "next";

import { SalesUnitsView } from "@/components/crm/views/sales-units";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { currentMonth, parseMonth } from "@/lib/sales/credits";

export const metadata: Metadata = { title: "Số lượng bán · Đại Việt CRM" };

// Số lượng bán theo tháng (Owner chốt 18/10/2026): CRM không quản lý tồn kho vì hàng xuất hết từ kho Đại Việt.
export default async function Page({ searchParams }: PageProps<"/inventory">) {
  await requirePermission("inventory.view");
  const month = parseMonth((await searchParams).thang);
  const supabase = await createClient();
  const { data } = await supabase.rpc("sales_units_month", { p_month: month });
  return (
    <SalesUnitsView
      month={month}
      current={currentMonth()}
      rows={(data ?? []).map((r) => ({
        variantId: r.variant_id,
        sku: r.sku,
        name: r.name,
        sold: r.sold,
        gifts: r.gifts,
        delivered: r.delivered,
        returned: r.returned,
        pending: r.pending,
      }))}
    />
  );
}
