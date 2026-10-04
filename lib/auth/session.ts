import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/db/server";

export type { SessionUser } from "./types";
import type { SessionUser } from "./types";

/** Lấy người dùng và quyền hiệu lực một lần mỗi request (CLAUDE.md mục 5, Hàm kiểm tra). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // GET: chạy được cả khi đang "Xem như" (database chặn mọi lệnh ghi trong phiên đó).
  const { data: who } = await supabase.rpc("whoami", undefined, { get: true }).maybeSingle();
  const effectiveId = who?.effective_uid ?? user.id;
  const viewAsSession = who?.view_as_session_id ?? null;

  const [{ data: profile }, { data: perms }, owner] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, is_active, showroom_id, showrooms(name), roles(name)")
      .eq("id", effectiveId)
      .maybeSingle(),
    supabase.rpc("my_permissions", undefined, { get: true }),
    viewAsSession
      ? supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!profile || !profile.is_active) return null;

  return {
    id: effectiveId,
    email: user.email ?? null,
    fullName: profile.full_name,
    showroomId: profile.showroom_id,
    showroomName: profile.showrooms?.name ?? "",
    roleName: profile.roles?.name ?? "",
    permissions: new Set((perms ?? []) as string[]),
    viewAs: viewAsSession ? { sessionId: viewAsSession, ownerName: owner.data?.full_name ?? "" } : null,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Trang cần một quyền: không có thì hiện trang báo chưa được cấp quyền (DESIGN.md mục 7). */
export async function requirePermission(perm: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.permissions.has(perm)) redirect("/forbidden");
  return user;
}

/** Dùng trong server action ghi dữ liệu: chặn khi đang "Xem như" (database cũng chặn). */
export async function requireWritable(perm: string): Promise<SessionUser> {
  const user = await requirePermission(perm);
  if (user.viewAs) throw new Error("Đang xem như người dùng khác, chỉ đọc.");
  return user;
}

/** Trang cần một trong các quyền. */
export async function requireAnyPermission(perms: string[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!perms.some((p) => user.permissions.has(p))) redirect("/forbidden");
  return user;
}
