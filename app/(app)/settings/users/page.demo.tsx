"use client";

import { DemoPage } from "@/components/demo/demo-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { STAFF } from "@/lib/demo/data";

import { UsersTable } from "./users-table";

const ROLES = [
  { id: "owner", name: "Chủ hệ thống", isOwner: true },
  { id: "sale_admin", name: "Sale admin", isOwner: false },
  { id: "telesale", name: "Telesale", isOwner: false },
  { id: "showroom", name: "Tiếp khách showroom", isOwner: false },
];

const notSaved = async () => ({ ok: true as const, message: "Bản demo: thao tác không được lưu." });

export default function Page() {
  return (
    <DemoPage anyOf={["settings.users"]}>
      {(user) => (
        <UsersTable
          meId={user.id}
          canEditPermissions={user.permissions.has("settings.permissions")}
          users={STAFF.map((s) => ({
            id: s.id,
            fullName: s.fullName,
            isActive: s.status !== "offboarded",
            roleId: s.roleKey,
          }))}
          roles={ROLES}
          overrides={[{ userId: STAFF[4].id, key: "contact.phone_reveal_assigned", effect: "revoke" }]}
          roleGrants={PERMISSIONS.flatMap((p) => p.defaults.map((r) => `${r}:${p.key}`))}
          permissions={PERMISSIONS.filter((p) => p.grantable).map((p) => ({
            key: p.key,
            label: p.label,
            group: p.group,
          }))}
          actions={{
            changeRole: notSaved,
            inviteUser: notSaved,
            resetOverrides: notSaved,
            setPermissionOverride: notSaved,
            setUserActive: notSaved,
            startViewAs: async () => {},
          }}
        />
      )}
    </DemoPage>
  );
}
