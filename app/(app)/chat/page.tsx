import type { Metadata } from "next";

import { CrmTeamChat } from "@/components/crm/views/team-chat";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nhóm nội bộ · Đại Việt CRM" };

// Nhóm trao đổi nội bộ kiểu Telegram, đang chạy bằng dữ liệu mô phỏng (lib/demo/team-chat.ts).
// Bảng lưu tin thật và quyền riêng chờ duyệt (docs/open-questions.md mục 28).
export default async function Page() {
  await requireUser();
  return <CrmTeamChat />;
}
