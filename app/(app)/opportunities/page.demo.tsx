"use client";

import { CrmOpportunities } from "@/components/crm/views/opportunities";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["lead.view_own", "lead.view_all"]}>{() => <CrmOpportunities />}</DemoPage>;
}
