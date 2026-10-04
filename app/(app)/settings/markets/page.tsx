import type { Metadata } from "next";

import { MarketSettings } from "@/components/crm/views/settings";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Thị trường · Đại Việt CRM" };

// Đang chạy bằng dữ liệu mô phỏng trong trình duyệt (components/crm/store.tsx).
export default async function Page() {
  await requirePermission("settings.assignment");
  return <MarketSettings />;
}
