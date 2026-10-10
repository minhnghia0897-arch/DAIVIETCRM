"use client";

import { CrmOrders } from "@/components/crm/views/orders";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["order.view_own", "order.view_all"]}>{() => <CrmOrders />}</DemoPage>;
}
