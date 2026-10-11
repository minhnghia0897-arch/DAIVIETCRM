"use client";

import { CrmCustomer } from "@/components/crm/views/customer";
import { DemoPage } from "@/components/demo/demo-user";
import { CUSTOMER_VIEW } from "@/lib/nav";

export function CustomerDemo({ id }: { id: string }) {
  return <DemoPage anyOf={CUSTOMER_VIEW}>{() => <CrmCustomer id={id} />}</DemoPage>;
}
