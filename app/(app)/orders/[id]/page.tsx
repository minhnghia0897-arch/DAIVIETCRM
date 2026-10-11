import type { Metadata } from "next";

import { CrmOrder } from "@/components/crm/views/orders";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Đơn hàng · Đại Việt CRM" };

export default async function Page({ params }: PageProps<"/orders/[id]">) {
  await requireAnyPermission(["order.view_own", "order.view_all"]);
  const { id } = await params;
  return <CrmOrder id={id} />;
}
