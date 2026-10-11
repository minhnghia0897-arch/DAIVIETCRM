import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/db/server";

export type { SessionUser } from "./types";
import type { SessionUser } from "./types";

/**
 * Lấy người dùng và quyền hiệu lực một lần mỗi request (CLAUDE.md mục 5, Hàm kiểm tra).
 * Nhanh: phiên kiểm bằng chữ ký JWT ngay tại server (getClaims, không gọi máy chủ Auth), rồi hỏi database một lượt
 * song song (người hiệu lực, quyền, hồ sơ). Người bị khóa vẫn bị chặn ở đây (is_active) và ở RLS (has_perm).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims?.sub) return null;
  const uid = claims.sub;

  const profileOf = (id: string) =>
    supabase
      .from("profiles")
      .select("full_name, is_active, showroom_id, showrooms(name), roles(key, name)")
      .eq("id", id)
      .maybeSingle();
  // GET: chạy được cả khi đang "Xem như" (database chặn mọi lệnh ghi trong phiên đó). my_permissions đã tính theo
  // người hiệu lực nên chạy song song được.
  const [{ data: who }, { data: perms }, { data: me }] = await Promise.all([
    supabase.rpc("whoami", undefined, { get: true }).maybeSingle(),
    supabase.rpc("my_permissions", undefined, { get: true }),
    profileOf(uid),
  ]);
  if (!me || !me.is_active) return null;
  const effectiveId = who?.effective_uid ?? uid;
  const viewAsSession = who?.view_as_session_id ?? null;
  // Hiếm: đang "Xem như" người khác thì đọc thêm hồ sơ của người đó.
  const profile = effectiveId === uid ? me : (await profileOf(effectiveId)).data;
  if (!profile || !profile.is_active) return null;

  return {
    id: effectiveId,
    email: typeof claims.email === "string" ? claims.email : null,
    fullName: profile.full_name,
    showroomId: profile.showroom_id,
    showroomName: profile.showrooms?.name ?? "",
    roleName: profile.roles?.name ?? "",
    roleKey: profile.roles?.key ?? "",
    permissions: new Set((perms ?? []) as string[]),
    viewAs: viewAsSession ? { sessionId: viewAsSession, ownerName: me.full_name } : null,
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
