"use client";

import { TaskRuleSettings } from "@/components/crm/views/settings";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["settings.assignment"]}>{() => <TaskRuleSettings />}</DemoPage>;
}
