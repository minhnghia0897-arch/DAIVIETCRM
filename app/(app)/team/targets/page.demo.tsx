"use client";

import { CrmTargets } from "@/components/crm/views/team";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["target.manage", "kpi.team"]}>{() => <CrmTargets />}</DemoPage>;
}
