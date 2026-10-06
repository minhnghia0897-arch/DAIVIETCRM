"use client";

import { CrmTeamChat } from "@/components/crm/views/team-chat";
import { DemoPage } from "@/components/demo/demo-user";

export default function Page() {
  return <DemoPage>{() => <CrmTeamChat />}</DemoPage>;
}
