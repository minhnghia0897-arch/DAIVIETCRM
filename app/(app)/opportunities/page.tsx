import type { Metadata } from "next";

import { CrmOpportunities } from "@/components/crm/views/opportunities";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Cơ hội · Đại Việt CRM" };

// Màn hình theo bản mẫu, đang chạy bằng dữ liệu mô phỏng (lib/demo/crm-data.ts).
export default async function Page() {
  await requireAnyPermission(["lead.view_own", "lead.view_all"]);
  return <CrmOpportunities />;
}
