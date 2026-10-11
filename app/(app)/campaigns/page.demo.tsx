"use client";

import { CampaignsView } from "@/components/crm/views/marketing";
import { DemoPage } from "@/components/demo/demo-user";
import { DEMO_CAMPAIGNS, DEMO_MARKETS } from "@/lib/marketing/demo";
import { MARKETING_VIEW } from "@/lib/nav";

// Bản demo: thao tác chỉ báo kết quả, không lưu (bản thật lưu vào database, Owner duyệt ngân sách ở Việc cần làm).
const demo = async () => ({ ok: true, message: "Bản mô phỏng: chưa lưu. Bản thật lưu vào database." });

export default function Page() {
  return (
    <DemoPage anyOf={MARKETING_VIEW}>
      {(user) => (
        <CampaignsView
          campaigns={DEMO_CAMPAIGNS}
          markets={DEMO_MARKETS}
          canManage={user.permissions.has("marketing.manage")}
          canApprove={user.permissions.has("marketing.budget_approve")}
          today="2026-10-10"
          actions={{ save: demo, requestBudget: demo, recordSpend: demo, importCsv: demo }}
        />
      )}
    </DemoPage>
  );
}
