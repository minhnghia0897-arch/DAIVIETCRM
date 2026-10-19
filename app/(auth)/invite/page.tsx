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
  // Ghi rõ đang đặt mật khẩu cho tài khoản nào: mở link đặt lại mật khẩu trên máy của người khác là đổi tài khoản.
  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  return (
    <Card>
      <CardBody className="space-y-4 py-5">
        <h1 className="text-page-title font-bold">Đặt mật khẩu</h1>
        <p className="text-text-weak">
          Đặt mật khẩu cho tài khoản <b className="text-text">{me?.full_name ?? user.email}</b>
          {me?.full_name && user.email ? ` (${user.email})` : ""}, sau đó đăng nhập bằng email và mật khẩu
          này.
        </p>
        <InviteForm />
      </CardBody>
    </Card>
  );
}
