"use client";

import { CrmCoaching } from "@/components/crm/views/team";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["coaching.manage"]}>{() => <CrmCoaching />}</DemoPage>;
}
