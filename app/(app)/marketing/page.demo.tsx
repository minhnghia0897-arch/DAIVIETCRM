"use client";

import { MarketingOverview } from "@/components/crm/views/marketing";
import { DemoPage } from "@/components/demo/demo-user";
import { DEMO_MARKETS, DEMO_OVERVIEW } from "@/lib/marketing/demo";
import { MARKETING_VIEW } from "@/lib/nav";

export default function Page() {
  return (
    <DemoPage anyOf={MARKETING_VIEW}>
      {() => <MarketingOverview rows={DEMO_OVERVIEW} days={30} markets={DEMO_MARKETS} demo />}
    </DemoPage>
  );
}
