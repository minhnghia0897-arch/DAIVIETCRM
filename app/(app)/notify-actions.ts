"use server";

import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import type { NoticeFeed } from "@/lib/notify/notice";

// Chuông thông báo trong ứng dụng (bảng notifications, CLAUDE.md mục 4): 20 thông báo gần nhất của chính mình và
// số chưa đọc. Thông báo không chứa số điện thoại hay nội dung tin nhắn.

export async function loadNotices(): Promise<NoticeFeed> {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, link, created_at, read_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);
  return {
    items: (data ?? []).map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      link: n.link,
      createdAt: n.created_at,
      read: Boolean(n.read_at),
    })),
    unread: count ?? 0,
  };
}

/** Đánh dấu đã đọc: các thông báo được chọn, hoặc tất cả khi không truyền. */
export async function markNoticesRead(ids?: string[]): Promise<void> {
  const user = await requireUser();
  if (user.viewAs) return;
  const supabase = await createClient();
  let q = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (ids) q = q.in("id", z.array(z.uuid()).max(100).parse(ids));
  await q;
}
