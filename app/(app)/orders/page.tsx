import type { Metadata } from "next";

import { OrdersView } from "@/components/views/orders";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Đơn hàng · Đại Việt CRM" };

export default async function Page({ searchParams }: PageProps<"/orders">) {
  const user = await requireAnyPermission(["order.view_own", "order.view_all"]);
  return <OrdersView user={user} searchParams={await searchParams} />;
}
