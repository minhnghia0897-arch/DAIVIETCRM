import type { Metadata } from "next";

import { ReportsLive } from "@/components/crm/views/reports-live";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Báo cáo · Đại Việt CRM" };

// Báo cáo đang làm lại từ đầu trên dữ liệu thật (Owner chốt 06/11/2026): bản thật không còn số mô phỏng; bản demo tĩnh
// vẫn dùng màn mô phỏng (page.demo.tsx).
export default async function Page() {
  const user = await requireAnyPermission(["report.own", "report.team"]);
  const has = (p: string) => user.permissions.has(p);
  return (
    <ReportsLive
      team={has("report.team")}
      kpi={has("kpi.team") ? "team" : has("kpi.own") ? "own" : null}
      units={has("inventory.view")}
    />
  );
}
