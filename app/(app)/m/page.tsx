import type { Metadata } from "next";

import { MiniApp } from "@/components/crm/views/mini-app";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Mini App · Đại Việt CRM" };

// Giao diện gọn cho điện thoại, mở từ bot Telegram. Đang chạy bằng dữ liệu mô phỏng.
export default async function Page({ searchParams }: PageProps<"/m">) {
  await requireUser();
  const sp = await searchParams;
  return (
    <MiniApp
      tab={typeof sp.tab === "string" ? sp.tab : undefined}
      id={typeof sp.id === "string" ? sp.id : undefined}
    />
  );
}
