import type { Metadata } from "next";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";

import { startViewAs } from "../../view-as/actions";
import {
  changeRole,
  inviteUser,
  issueLoginLink,
  resetOverrides,
  setPermissionOverride,
  setUserActive,
} from "../actions";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Người dùng · Đại Việt CRM" };

export default async function UsersPage() {
  const me = await requirePermission("settings.users");
  const supabase = await createClient();
  const [{ data: profiles }, { data: roles }, { data: overrides }, { data: grants }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, is_active, role_id, created_at").order("created_at"),
    supabase.from("roles").select("id, key, name, is_owner").order("created_at"),
    supabase.from("user_permission_overrides").select("user_id, permission_key, effect"),
    supabase.from("role_permissions").select("role_id, permission_key"),
  ]);

  // Email đăng nhập và đã vào CRM lần nào chưa: chỉ đọc ở máy chủ cho người có settings.users (danh sách tài khoản
  // của showroom, đội nhỏ nên một trang là đủ).
  const ids = new Set((profiles ?? []).map((p) => p.id));
  const { data: auth } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
  const authOf = new Map((auth?.users ?? []).filter((u) => ids.has(u.id)).map((u) => [u.id, u]));

  return (
    <UsersTable
      actions={{
        changeRole,
        inviteUser,
        issueLoginLink,
        resetOverrides,
        setPermissionOverride,
        setUserActive,
        startViewAs,
      }}
      meId={me.id}
      canEditPermissions={me.permissions.has("settings.permissions")}
      users={(profiles ?? []).map((p) => ({
        id: p.id,
        fullName: p.full_name,
        isActive: p.is_active,
        roleId: p.role_id,
        email: authOf.get(p.id)?.email ?? null,
        pending: authOf.has(p.id) && !authOf.get(p.id)?.last_sign_in_at,
      }))}
      roles={(roles ?? []).map((r) => ({ id: r.id, key: r.key, name: r.name, isOwner: r.is_owner }))}
      overrides={(overrides ?? []).map((o) => ({
        userId: o.user_id,
        key: o.permission_key,
        effect: o.effect as "grant" | "revoke",
      }))}
      roleGrants={(grants ?? []).map((g) => `${g.role_id}:${g.permission_key}`)}
      permissions={PERMISSIONS.filter((p) => p.grantable).map((p) => ({
        key: p.key,
        label: p.label,
        group: p.group,
      }))}
    />
  );
}
