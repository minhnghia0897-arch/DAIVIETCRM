import type { Metadata } from "next";

import { CrmTasks } from "@/components/crm/views/tasks";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Việc cần làm · Đại Việt CRM" };

// Đang chạy bằng dữ liệu mô phỏng trong trình duyệt (components/crm/store.tsx).
export default async function Page() {
  await requireAnyPermission(["lead.view_own", "lead.view_all"]);
  return <CrmTasks />;
}
