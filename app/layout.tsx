import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Đại Việt CRM",
  description: "Quản lý khách hàng showroom Đại Việt",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
