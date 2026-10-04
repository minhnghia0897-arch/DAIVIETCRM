// Sinh khối SQL quyền cho supabase/seed.sql từ lib/auth/permissions.ts.
// Chạy: node scripts/gen-permission-seed.mts > khối SQL; dán vào một migration mới khi thêm, đổi quyền.
import { PERMISSIONS } from "../lib/auth/permissions.ts";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const lines: string[] = [];
lines.push("-- Sinh tự động từ lib/auth/permissions.ts bằng scripts/gen-permission-seed.ts. Không sửa tay.");
lines.push('insert into public.permissions (key, "group", description, grantable, sensitive) values');
lines.push(
  PERMISSIONS.map(
    (p) => `  (${q(p.key)}, ${q(p.group)}, ${q(p.label)}, ${p.grantable}, ${p.sensitive})`,
  ).join(",\n") +
    '\non conflict (key) do update set "group" = excluded."group", description = excluded.description,\n' +
    "  grantable = excluded.grantable, sensitive = excluded.sensitive;",
);
lines.push("");
lines.push("insert into public.role_permissions (role_id, permission_key)");
lines.push("select r.id, v.permission_key from (values");
const pairs: string[] = [];
for (const p of PERMISSIONS) for (const role of p.defaults) pairs.push(`  (${q(role)}, ${q(p.key)})`);
lines.push(pairs.join(",\n"));
lines.push(") as v (role_key, permission_key)");
lines.push("join public.roles r on r.key = v.role_key");
lines.push("on conflict do nothing;");
process.stdout.write(lines.join("\n") + "\n");
