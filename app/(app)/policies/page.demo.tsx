"use client";

import { CrmPolicies } from "@/components/crm/views/policies";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["policy.view"]}>{() => <CrmPolicies />}</DemoPage>;
}
