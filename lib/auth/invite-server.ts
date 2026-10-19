import "server-only";

import { createAdminClient } from "@/lib/db/admin";

import { hashInviteToken, isInviteToken } from "./invite-token";

export interface OpenInvite {
  id: string;
  showroomId: string;
  roleId: string;
  roleName: string;
  showroomName: string;
  expiresAt: string;
  createdBy: string;
}

/**
 * Link mời còn dùng được (chưa dùng, chưa hủy, chưa hết hạn) theo mã trong link. Người mở link chưa đăng nhập nên đọc
 * bằng khóa máy chủ; chỉ trả vị trí và tên showroom, không trả ghi chú hay người tạo ra giao diện.
 */
export async function findOpenInvite(token: string): Promise<OpenInvite | null> {
  if (!isInviteToken(token)) return null;
  const { data } = await createAdminClient()
    .from("invite_links")
    .select("id, showroom_id, role_id, expires_at, created_by, roles(name, is_owner), showrooms(name)")
    .eq("token_hash", hashInviteToken(token))
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data || !data.roles || data.roles.is_owner) return null;
  return {
    id: data.id,
    showroomId: data.showroom_id,
    roleId: data.role_id,
    roleName: data.roles.name,
    showroomName: data.showrooms?.name ?? "",
    expiresAt: data.expires_at,
    createdBy: data.created_by,
  };
}
