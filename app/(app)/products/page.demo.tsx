"use client";

import { DemoPage } from "@/components/demo/demo-user";
import { WithSearchParams } from "@/components/demo/search-params";
import { ProductsView } from "@/components/views/products";

export default function Page() {
  return (
    <DemoPage anyOf={["product.view"]}>
      {(user) => (
        <WithSearchParams>{(sp) => <ProductsView user={user} searchParams={sp} />}</WithSearchParams>
      )}
    </DemoPage>
  );
}
