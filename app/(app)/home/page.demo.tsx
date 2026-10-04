"use client";

import { CrmHome } from "@/components/crm/views/home";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage>{() => <CrmHome />}</DemoPage>;
}
