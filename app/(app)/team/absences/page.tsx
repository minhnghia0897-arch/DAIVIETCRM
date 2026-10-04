import type { Metadata } from "next";

import { CrmAbsences } from "@/components/crm/views/team";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nghỉ và trực · Đại Việt CRM" };

// Đang chạy bằng dữ liệu mô phỏng trong trình duyệt (components/crm/store.tsx).
export default async function Page() {
  await requireAnyPermission(["staff.manage", "attendance.view_team"]);
  return <CrmAbsences />;
}
