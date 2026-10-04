"use client";

import { DemoPage } from "@/components/demo/demo-user";
import { WithSearchParams } from "@/components/demo/search-params";
import { InventoryView } from "@/components/views/inventory";

export default function Page() {
  return (
    <DemoPage anyOf={["inventory.view"]}>
      {(user) => (
        <WithSearchParams>{(sp) => <InventoryView user={user} searchParams={sp} />}</WithSearchParams>
      )}
    </DemoPage>
  );
}
