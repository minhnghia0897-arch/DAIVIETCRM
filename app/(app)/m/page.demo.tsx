"use client";

import { MiniApp } from "@/components/crm/views/mini-app";
import { DemoPage } from "@/components/demo/demo-user";
import { WithSearchParams } from "@/components/demo/search-params";

export default function Page() {
  return (
    <DemoPage>
      {() => (
        <WithSearchParams>
          {(sp) => (
            <MiniApp
              key={`${sp.tab ?? ""}${sp.id ?? ""}`}
              tab={typeof sp.tab === "string" ? sp.tab : undefined}
              id={typeof sp.id === "string" ? sp.id : undefined}
            />
          )}
        </WithSearchParams>
      )}
    </DemoPage>
  );
}
