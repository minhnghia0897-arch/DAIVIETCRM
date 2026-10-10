import type { Metadata } from "next";

import { CrmTargets } from "@/components/crm/views/team";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Chỉ tiêu · Đại Việt CRM" };

// Đang chạy bằng dữ liệu mô phỏng trong trình duyệt (components/crm/store.tsx).
export default async function Page() {
  await requireAnyPermission(["target.manage", "kpi.team"]);
  return <CrmTargets />;
}
