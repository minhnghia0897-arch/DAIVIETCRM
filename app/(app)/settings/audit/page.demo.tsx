"use client";

import { AuditLogView } from "@/components/crm/views/settings";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["audit.view"]}>{() => <AuditLogView />}</DemoPage>;
}
