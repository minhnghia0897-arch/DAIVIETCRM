import type { Metadata } from "next";

import { CallModeSettings } from "@/components/crm/views/settings";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Chế độ gọi · Đại Việt CRM" };

// Đang chạy bằng dữ liệu mô phỏng trong trình duyệt (components/crm/store.tsx).
export default async function Page() {
  await requirePermission("settings.integrations");
  return <CallModeSettings />;
}
