"use client";

import { CrmHome } from "@/components/crm/views/home";
import { DemoPage } from "@/components/demo/demo-user";
import { LEAD_VIEW } from "@/lib/nav";

// Trang chủ theo phong cách Telegram (.tgx trong crm.css), như bản thật.
export default function Page() {
  return (
    <DemoPage anyOf={LEAD_VIEW}>
      {() => (
        <div className="tgx">
          <CrmHome />
        </div>
      )}
    </DemoPage>
  );
}
