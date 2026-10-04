import type { Metadata } from "next";

import { OrderView } from "@/components/views/orders-detail";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Đơn hàng · Đại Việt CRM" };

export default async function Page({ params }: PageProps<"/orders/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  return <OrderView user={user} id={id} />;
}
