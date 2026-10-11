"use client";

import { ShiftSettings } from "@/components/crm/views/settings";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["settings.assignment"]}>{() => <ShiftSettings />}</DemoPage>;
}
