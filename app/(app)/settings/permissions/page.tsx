import type { Metadata } from "next";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import { PermissionMatrix } from "./permission-matrix";

export const metadata: Metadata = { title: "Phân quyền · Đại Việt CRM" };

export default async function PermissionsPage() {
  await requirePermission("settings.permissions");
  const supabase = await createClient();
  const [{ data: roles }, { data: grants }, { data: perms }] = await Promise.all([
    supabase.from("roles").select("id, name, is_owner, is_system, created_at").order("created_at"),
    supabase.from("role_permissions").select("role_id, permission_key"),
    supabase.from("permissions").select("key, group, description, grantable, sensitive"),
  ]);

  // Thứ tự và nhãn theo lib/auth/permissions.ts; quyền có trong database nhưng chưa có trong code xếp cuối.
  const order = new Map(PERMISSIONS.map((p, i) => [p.key, i]));
  const rows = (perms ?? [])
    .map((p) => ({
      key: p.key,
      group: p.group,
      label: p.description,
      grantable: p.grantable,
      sensitive: p.sensitive,
    }))
    .sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));

  const sortedRoles = (roles ?? []).sort((a, b) => Number(b.is_owner) - Number(a.is_owner));

  return (
    <PermissionMatrix
      roles={sortedRoles.map((r) => ({ id: r.id, name: r.name, isOwner: r.is_owner }))}
      permissions={rows}
      granted={(grants ?? []).map((g) => `${g.role_id}:${g.permission_key}`)}
    />
  );
}
