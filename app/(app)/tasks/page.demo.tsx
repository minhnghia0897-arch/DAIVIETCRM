"use client";

import { CrmTasks } from "@/components/crm/views/tasks";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["lead.view_own", "lead.view_all"]}>{() => <CrmTasks />}</DemoPage>;
}
