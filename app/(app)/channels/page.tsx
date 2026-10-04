import type { Metadata } from "next";

import { CrmChannels } from "@/components/crm/views/channels";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Kênh & nội dung · Đại Việt CRM" };

// Màn hình theo bản mẫu, đang chạy bằng dữ liệu mô phỏng (lib/demo/crm-data.ts).
export default async function Page() {
  await requireAnyPermission(["report.team"]);
  return <CrmChannels />;
}
