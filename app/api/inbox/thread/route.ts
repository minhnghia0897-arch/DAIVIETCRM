import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { UUID_RE, loadOpened } from "@/lib/inbox/thread-server";

// Tải nhanh một hội thoại khi bấm chuyển trên màn Hội thoại (và tải sẵn khi rê chuột, chạm): chỉ tin nhắn và cột
// phải, không vẽ lại cả trang. Cùng hàm tải với trang, chạy bằng phiên người dùng nên RLS lọc như trang; số điện thoại
// chỉ ở dạng che (CLAUDE.md mục 5).

const PERMS = ["message.zalo_send", "message.messenger_send", "message.view_all"];

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Phiên đăng nhập đã hết, đăng nhập lại." }, { status: 401 });
  if (!PERMS.some((p) => user.permissions.has(p)))
    return NextResponse.json({ error: "Anh chị chưa được cấp quyền xem hội thoại." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("c") ?? "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Hội thoại không hợp lệ." }, { status: 400 });

  const opened = await loadOpened(await createClient(), user, id);
  if (!opened)
    return NextResponse.json(
      { error: "Không mở được hội thoại này: đã bị xóa hoặc anh chị không còn phụ trách." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  return NextResponse.json(
    { thread: opened.thread, side: opened.side },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
