"use client";

import { DemoPage } from "@/components/demo/demo-user";
import { TeamNav } from "@/components/views/team-nav";
import { TEAM_VIEW } from "@/lib/nav";

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoPage anyOf={TEAM_VIEW}>
      {(user) => (
        <div className="mx-auto max-w-7xl space-y-4">
          <TeamNav user={user} allDemo />
          {children}
        </div>
      )}
    </DemoPage>
  );
}
