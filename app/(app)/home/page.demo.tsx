"use client";

import { DemoPage } from "@/components/demo/demo-user";
import { HomeView } from "@/components/views/home";
import { CUSTOMERS } from "@/lib/demo/data";
import { MARKETS } from "@/lib/demo/labels";
import { staffName } from "@/lib/demo/repo";

// Lead đang mở mô phỏng: khách ở giai đoạn Lead hoặc Ngủ đông.
const LEADS = CUSTOMERS.filter((c) => c.lifecycle === "lead" || c.lifecycle === "dormant").map((c, i) => ({
  id: c.id,
  stage: c.lifecycle === "dormant" ? "contacted" : i % 2 ? "contacted" : "new",
  slaDueAt: i === 0 ? "2026-10-04T09:35:00+07:00" : null,
  firstContactAt: null,
  assignedTo: c.id === "c-yen" ? null : c.ownerId,
  contactName: c.fullName,
  market: c.market,
  assigneeName: c.id === "c-yen" ? null : staffName(c.ownerId),
}));

export default function Page() {
  return (
    <DemoPage>
      {(user) => {
        const teamView = user.permissions.has("lead.view_all");
        return (
          <HomeView
            teamView={teamView}
            markets={MARKETS}
            now={new Date("2026-10-04T10:00:00+07:00")}
            rows={teamView ? LEADS : LEADS.filter((l) => l.assignedTo === user.id)}
          />
        );
      }}
    </DemoPage>
  );
}
