"use client";

import { TelegramPreview } from "@/components/crm/telegram-preview";
import { CrmHome } from "@/components/crm/views/home";
import { DemoPage } from "@/components/demo/demo-user";
import { LEAD_VIEW } from "@/lib/nav";

export default function Page() {
  return (
    <DemoPage anyOf={LEAD_VIEW}>
      {() => (
        <TelegramPreview>
          <CrmHome />
        </TelegramPreview>
      )}
    </DemoPage>
  );
}
