import type { Metadata } from "next";

import { CrmReports } from "@/components/crm/views/reports";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Báo cáo · Đại Việt CRM" };

// Màn hình theo bản mẫu, đang chạy bằng dữ liệu mô phỏng (lib/demo/crm-data.ts).
export default async function Page() {
  await requireAnyPermission(["report.own", "report.team"]);
  return <CrmReports />;
}
