"use client";

import { CrmChannels } from "@/components/crm/views/channels";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["marketing.view"]}>{() => <CrmChannels />}</DemoPage>;
}
