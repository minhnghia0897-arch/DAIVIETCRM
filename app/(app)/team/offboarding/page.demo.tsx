"use client";

import { CrmOffboarding } from "@/components/crm/views/team";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["staff.offboard"]}>{() => <CrmOffboarding />}</DemoPage>;
}
