"use client";

import { KocNav } from "@/components/crm/koc/nav";
import { KocProvider } from "@/components/crm/koc/provider";
import { DemoPage } from "@/components/demo/demo-user";
import { KOC_VIEW } from "@/lib/koc/actions";

export default function KocLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoPage anyOf={KOC_VIEW}>
      {() => (
        <KocProvider>
          <div className="mx-auto max-w-7xl space-y-4">
            <KocNav />
            {children}
          </div>
        </KocProvider>
      )}
    </DemoPage>
  );
}
