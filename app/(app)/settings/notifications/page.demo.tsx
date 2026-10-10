"use client";

import { NotifySettings } from "@/components/crm/views/notify-settings";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage>{() => <NotifySettings />}</DemoPage>;
}
