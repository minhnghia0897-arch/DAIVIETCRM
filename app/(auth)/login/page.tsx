import type { Metadata } from "next";

import { Card, CardBody } from "@/components/ui/card";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập · Đại Việt CRM" };

export default function LoginPage() {
  return (
    <Card>
      <CardBody className="space-y-4 py-5">
        <h1 className="text-page-title font-bold">Đăng nhập</h1>
        <LoginForm />
        <p className="text-label text-text-weak">
          Chưa có tài khoản? Hệ thống chỉ dùng qua lời mời. Liên hệ quản lý showroom.
        </p>
      </CardBody>
    </Card>
  );
}
