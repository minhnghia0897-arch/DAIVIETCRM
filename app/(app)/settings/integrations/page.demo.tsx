"use client";

import { IntegrationSettings } from "@/components/crm/views/settings";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["settings.integrations"]}>{() => <IntegrationSettings />}</DemoPage>;
}
