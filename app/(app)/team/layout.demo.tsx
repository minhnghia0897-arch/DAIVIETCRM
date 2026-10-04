"use client";

import { DemoPage } from "@/components/demo/demo-user";
import { TeamNav } from "@/components/views/team-nav";

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoPage anyOf={["kpi.own", "kpi.team"]}>
      {(user) => (
        <div className="mx-auto max-w-7xl space-y-4">
          <TeamNav user={user} />
          {children}
        </div>
      )}
    </DemoPage>
  );
}
