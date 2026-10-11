"use client";

import { DemoPage } from "@/components/demo/demo-user";
import { TeamOverviewView } from "@/components/views/team-overview";

export default function Page() {
  return <DemoPage>{(user) => <TeamOverviewView user={user} />}</DemoPage>;
}
