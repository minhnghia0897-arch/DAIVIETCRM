"use client";

import { CrmDeliveries } from "@/components/crm/views/deliveries";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["order.view_own", "order.view_all"]}>{() => <CrmDeliveries />}</DemoPage>;
}
