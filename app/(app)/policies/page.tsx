import type { Metadata } from "next";

import { CrmPolicies } from "@/components/crm/views/policies";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Chính sách · Đại Việt CRM" };

// Đang chạy bằng dữ liệu mô phỏng trong trình duyệt (components/crm/store.tsx).
export default async function Page() {
  await requirePermission("policy.view");
  return <CrmPolicies />;
}
