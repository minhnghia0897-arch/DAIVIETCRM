import type { Metadata } from "next";

import { CrmInbox } from "@/components/crm/views/inbox";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Hội thoại · Đại Việt CRM" };

// Màn hình theo bản mẫu, đang chạy bằng dữ liệu mô phỏng (lib/demo/crm-data.ts).
export default async function Page() {
  await requireAnyPermission(["message.zalo_send", "message.view_all"]);
  return <CrmInbox />;
}
