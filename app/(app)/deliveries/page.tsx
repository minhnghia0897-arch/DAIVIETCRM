import type { Metadata } from "next";

import { CrmDeliveries } from "@/components/crm/views/deliveries";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Đơn & giao lắp · Đại Việt CRM" };

// Màn hình theo bản mẫu, đang chạy bằng dữ liệu mô phỏng (lib/demo/crm-data.ts).
export default async function Page() {
  await requireAnyPermission(["order.view_own", "order.view_all"]);
  return <CrmDeliveries />;
}
