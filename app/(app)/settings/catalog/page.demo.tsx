"use client";

import { CatalogSettings } from "@/components/crm/views/settings";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage anyOf={["catalog.view", "catalog.manage"]}>{() => <CatalogSettings />}</DemoPage>;
}
