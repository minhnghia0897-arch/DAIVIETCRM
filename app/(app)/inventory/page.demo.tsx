"use client";

import { CrmInventory } from "@/components/crm/views/inventory";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["inventory.view"]}>{() => <CrmInventory />}</DemoPage>;
}
