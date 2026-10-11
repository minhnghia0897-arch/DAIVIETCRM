import type { Metadata } from "next";

import { CrmOrders } from "@/components/crm/views/orders";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Đơn hàng · Đại Việt CRM" };

// Đang chạy bằng dữ liệu mô phỏng trong trình duyệt (components/crm/store.tsx).
export default async function Page() {
  await requireAnyPermission(["order.view_own", "order.view_all"]);
  return <CrmOrders />;
}
