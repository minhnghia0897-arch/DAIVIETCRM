import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import "./globals.css";

// Kiểu chữ gần Slack (Lato không có bộ chữ tiếng Việt nên dùng Nunito Sans). next/font tự lưu font cùng trang
// lúc build, trình duyệt không gọi Google khi chạy.
const appFont = Nunito_Sans({ subsets: ["latin", "vietnamese"], variable: "--font-app", display: "swap" });

export const metadata: Metadata = {
  title: "Đại Việt CRM",
  description: "Quản lý khách hàng showroom Đại Việt",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${appFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
