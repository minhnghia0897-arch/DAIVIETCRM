"use client";

import { CrmHouseholds } from "@/components/crm/views/households";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["lead.view_own", "lead.view_all"]}>{() => <CrmHouseholds />}</DemoPage>;
}
