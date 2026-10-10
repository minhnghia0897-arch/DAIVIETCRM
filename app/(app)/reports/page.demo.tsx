"use client";

import { CrmReports } from "@/components/crm/views/reports";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["report.own", "report.team"]}>{() => <CrmReports />}</DemoPage>;
}
