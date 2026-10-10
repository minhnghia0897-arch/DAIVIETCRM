import type { Metadata } from "next";
import { Nunito_Sans, Roboto } from "next/font/google";
import "./globals.css";

// Kiểu chữ gần Slack (Lato không có bộ chữ tiếng Việt nên dùng Nunito Sans). next/font tự lưu font cùng trang
// lúc build, trình duyệt không gọi Google khi chạy.
const appFont = Nunito_Sans({ subsets: ["latin", "vietnamese"], variable: "--font-app", display: "swap" });
// Roboto: kiểu chữ của Telegram trên web, dùng cho phong cách Telegram (đang xem thử, .tgx trong crm.css).
const tgFont = Roboto({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "700"],
  variable: "--font-tg",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Đại Việt CRM",
  description: "Quản lý khách hàng showroom Đại Việt",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${appFont.variable} ${tgFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
