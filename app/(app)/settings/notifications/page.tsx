import type { Metadata } from "next";

import { NotifySettings } from "@/components/crm/views/notify-settings";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Thông báo Telegram · Đại Việt CRM" };

// Thông báo của chính mình: mọi người dùng. Đang chạy bằng dữ liệu mô phỏng; bot thật chờ duyệt
// (docs/open-questions.md mục 29, docs/integrations/telegram_bot.md).
export default async function Page() {
  await requireUser();
  return <NotifySettings />;
}
