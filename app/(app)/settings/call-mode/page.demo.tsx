"use client";

import { CallModeSettings } from "@/components/crm/views/settings";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["settings.integrations"]}>{() => <CallModeSettings />}</DemoPage>;
}
