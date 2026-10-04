"use client";

import { DemoPage } from "@/components/demo/demo-user";
import { WithSearchParams } from "@/components/demo/search-params";
import { CustomersView } from "@/components/views/customers";

export default function Page() {
  return (
    <DemoPage>
      {(user) => (
        <WithSearchParams>{(sp) => <CustomersView user={user} searchParams={sp} />}</WithSearchParams>
      )}
    </DemoPage>
  );
}
