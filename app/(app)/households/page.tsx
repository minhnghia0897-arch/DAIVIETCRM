import type { Metadata } from "next";

import { CrmHouseholds } from "@/components/crm/views/households";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Hộ gia đình · Đại Việt CRM" };

// Màn hình theo bản mẫu, đang chạy bằng dữ liệu mô phỏng (lib/demo/crm-data.ts).
export default async function Page() {
  await requireAnyPermission(["lead.view_own", "lead.view_all"]);
  return <CrmHouseholds />;
}
