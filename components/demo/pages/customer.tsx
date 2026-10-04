"use client";

import { CrmCustomer } from "@/components/crm/views/customer";
import { DemoPage } from "@/components/demo/demo-user";

export function CustomerDemo({ id }: { id: string }) {
  return <DemoPage anyOf={["lead.view_own", "lead.view_all"]}>{() => <CrmCustomer id={id} />}</DemoPage>;
}
