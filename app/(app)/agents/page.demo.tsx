"use client";

import { CrmAgents } from "@/components/crm/views/agents";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["settings.integrations"]}>{() => <CrmAgents />}</DemoPage>;
}
