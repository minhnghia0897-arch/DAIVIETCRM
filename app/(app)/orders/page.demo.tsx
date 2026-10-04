"use client";

import { DemoPage } from "@/components/demo/demo-user";
import { WithSearchParams } from "@/components/demo/search-params";
import { OrdersView } from "@/components/views/orders";

export default function Page() {
  return (
    <DemoPage anyOf={["order.view_own", "order.view_all"]}>
      {(user) => <WithSearchParams>{(sp) => <OrdersView user={user} searchParams={sp} />}</WithSearchParams>}
    </DemoPage>
  );
}
