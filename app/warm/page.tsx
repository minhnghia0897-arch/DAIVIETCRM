import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = { title: "Đại Việt CRM", robots: { index: false, follow: false } };

// Trang giữ ấm: database gọi trang này vài phút một lần trong giờ làm (lịch keep-app-warm, migration
// 20261012000500_keep_warm.sql) để máy chủ Vercel vẽ trang không ngủ, người mở CRM lần đầu trong ngày khỏi chờ khởi
// động. Cùng cấu hình với các trang thường nên chạy chung máy với chúng; không đọc database, không cần đăng nhập.
export default async function Page() {
  await connection();
  return <p>ok</p>;
}
