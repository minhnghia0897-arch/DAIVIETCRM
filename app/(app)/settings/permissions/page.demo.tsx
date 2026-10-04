"use client";

import { DemoPage } from "@/components/demo/demo-user";
import { PERMISSIONS, type RoleKey } from "@/lib/auth/permissions";

import { PermissionMatrix } from "./permission-matrix";

const ROLES: { id: RoleKey; name: string; isOwner: boolean }[] = [
  { id: "owner", name: "Chủ hệ thống", isOwner: true },
  { id: "sale_admin", name: "Sale admin", isOwner: false },
  { id: "telesale", name: "Telesale", isOwner: false },
];

export default function Page() {
  return (
    <DemoPage anyOf={["settings.permissions"]}>
      {() => (
        <PermissionMatrix
          roles={ROLES}
          permissions={PERMISSIONS.map((p) => ({
            key: p.key,
            group: p.group,
            label: p.label,
            grantable: p.grantable,
            sensitive: p.sensitive,
          }))}
          granted={PERMISSIONS.flatMap((p) => p.defaults.map((r) => `${r}:${p.key}`))}
          actions={{
            toggleRolePermission: async ({ permission, on, roleId }) => ({
              ok: true,
              message: `Đã ${on ? "bật" : "tắt"} ${PERMISSIONS.find((p) => p.key === permission)?.label} cho ${ROLES.find((r) => r.id === roleId)?.name} (bản demo, không lưu)`,
            }),
            createRole: async () => ({ ok: false, message: "Bản demo không tạo vai trò mới." }),
          }}
        />
      )}
    </DemoPage>
  );
}
