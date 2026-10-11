import type { Metadata } from "next";

import { CrmAgents } from "@/components/crm/views/agents";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Agent · Đại Việt CRM" };

// Màn hình theo bản mẫu, đang chạy bằng dữ liệu mô phỏng (lib/demo/crm-data.ts).
export default async function Page() {
  await requireAnyPermission(["settings.integrations"]);
  return <CrmAgents />;
}
