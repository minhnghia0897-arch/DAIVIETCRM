import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/db/server";

export interface SessionUser {
  id: string;
  email: string | null;
  fullName: string;
  showroomId: string;
  showroomName: string;
  roleName: string;
  permissions: ReadonlySet<string>;
}

/** Lấy người dùng và quyền hiệu lực một lần mỗi request (CLAUDE.md mục 5, Hàm kiểm tra). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: perms }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, is_active, showroom_id, showrooms(name), roles(name)")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.rpc("my_permissions"),
  ]);
  if (!profile || !profile.is_active) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile.full_name,
    showroomId: profile.showroom_id,
    showroomName: profile.showrooms?.name ?? "",
    roleName: profile.roles?.name ?? "",
    permissions: new Set((perms ?? []) as string[]),
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
