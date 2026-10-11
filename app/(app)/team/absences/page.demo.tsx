"use client";

import { CrmAbsences } from "@/components/crm/views/team";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["staff.manage", "attendance.view_team"]}>{() => <CrmAbsences />}</DemoPage>;
}
