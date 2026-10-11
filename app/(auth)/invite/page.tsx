import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardBody } from "@/components/ui/card";
import { createClient } from "@/lib/db/server";

import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Nhận lời mời · Đại Việt CRM" };

export default async function InvitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=link");

  return (
    <Card>
      <CardBody className="space-y-4 py-5">
        <h1 className="text-page-title font-bold">Đặt mật khẩu</h1>
        <p className="text-text-weak">Chào mừng anh chị. Đặt mật khẩu để bắt đầu dùng hệ thống.</p>
        <InviteForm />
      </CardBody>
    </Card>
  );
}
