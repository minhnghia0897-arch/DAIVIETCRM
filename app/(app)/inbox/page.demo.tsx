"use client";

import { CrmInbox } from "@/components/crm/views/inbox";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return (
    <DemoPage anyOf={["message.zalo_send", "message.messenger_send", "message.view_all"]}>
      {() => <CrmInbox />}
    </DemoPage>
  );
}
