import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { findOpenInvite } from "@/lib/auth/invite-server";
import { createClient } from "@/lib/db/server";
import { formatDateTime } from "@/lib/format";

import { leaveForJoin } from "./actions";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Nhận lời mời · Đại Việt CRM" };

// Link mời theo vị trí: người nhận tự tạo tài khoản của mình. Mở trang không làm tốn link (bản xem trước link của
// Zalo, Telegram cũng mở trang này); link chỉ bị dùng khi bấm Tạo tài khoản.
export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const invite = await findOpenInvite(token);

  if (!invite)
    return (
      <Card>
        <CardBody className="space-y-3 py-5">
          <h1 className="text-page-title font-bold">Link mời không còn dùng được</h1>
          <p className="text-text-weak">
            Link đã được dùng, đã bị hủy hoặc đã hết hạn. Nhờ quản lý showroom gửi link mời mới. Đã có tài
            khoản thì đăng nhập bằng email và mật khẩu của mình.
          </p>
          <Link href="/login" className="c-link">
            Đến trang Đăng nhập
          </Link>
        </CardBody>
      </Card>
    );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    return (
      <Card>
        <CardBody className="space-y-3 py-5">
          <h1 className="text-page-title font-bold">Đang đăng nhập tài khoản khác</h1>
          <p className="text-text-weak">
            Thiết bị này đang đăng nhập tài khoản <b className="text-text">{me?.full_name ?? user.email}</b>.
            Link mời để người mới tạo tài khoản riêng của họ, không dùng tài khoản đang đăng nhập.
          </p>
          <p className="text-text-weak">
            Anh chị là người gửi link thì chỉ cần gửi link cho người được mời. Anh chị là người được mời thì
            đăng xuất rồi tạo tài khoản.
          </p>
          <form action={leaveForJoin}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant="secondary" className="w-full">
              Đăng xuất để tạo tài khoản mới
            </Button>
          </form>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-4 py-5">
        <h1 className="text-page-title font-bold">Tạo tài khoản</h1>
        <p className="text-text-weak">
          Anh chị được mời vào CRM {invite.showroomName} với vị trí{" "}
          <b className="text-text">{invite.roleName}</b>. Nhập thông tin của mình để tạo tài khoản, sau này
          đăng nhập bằng email và mật khẩu này.
        </p>
        <JoinForm token={token} />
        <p className="text-label text-text-weak">
          Link dùng được một lần, hết hạn lúc {formatDateTime(invite.expiresAt)}.
        </p>
      </CardBody>
    </Card>
  );
}
