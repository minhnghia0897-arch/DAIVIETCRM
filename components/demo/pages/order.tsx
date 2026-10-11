"use client";

import { CrmOrder } from "@/components/crm/views/orders";
import { DemoPage } from "@/components/demo/demo-user";

export function OrderDemo({ id }: { id: string }) {
  return <DemoPage anyOf={["order.view_own", "order.view_all"]}>{() => <CrmOrder id={id} />}</DemoPage>;
}
