import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PERMISSIONS, can } from "@/lib/auth/permissions";

const migration = readFileSync("supabase/migrations/20261004000400_reference_data.sql", "utf8");
// Quyền thêm sau dữ liệu tham chiếu đi trong migration riêng, chỉ chèn dòng của quyền mới (chạy lại cả khối sẽ bật lại
// các quyền Owner đã tắt). Gộp mọi migration để so với code.
const allMigrations = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
  .join("\n");

describe("permissions", () => {
  it("không trùng key", () => {
    expect(new Set(PERMISSIONS.map((p) => p.key)).size).toBe(PERMISSIONS.length);
  });

  it("migration khớp với lib/auth/permissions.ts", () => {
    const generated = execFileSync("node", ["scripts/gen-permission-seed.mts"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    // Mỗi dòng quyền và mỗi cặp vai trò, quyền mặc định do script sinh ra phải có trong một migration.
    const rows = generated
      .split("\n")
      .map((l) => l.trim().replace(/,$/, ""))
      .filter((l) => l.startsWith("('"));
    expect(rows.length).toBeGreaterThan(PERMISSIONS.length);
    for (const row of rows) expect(allMigrations, row).toContain(row);
    expect(migration).toContain("insert into public.permissions");
  });

  it("quyền chỉ Owner chỉ thuộc Owner", () => {
    for (const p of PERMISSIONS.filter((x) => !x.grantable)) {
      expect(p.defaults).toEqual(["owner"]);
    }
  });

  it("Owner mặc định có mọi quyền trừ lead.receive", () => {
    const missing = PERMISSIONS.filter((p) => !p.defaults.includes("owner")).map((p) => p.key);
    expect(missing).toEqual(["lead.receive"]);
  });

  it("can() chỉ dựa trên danh sách quyền hiệu lực", () => {
    expect(can(new Set(["lead.create"]), "lead.create")).toBe(true);
    expect(can(["lead.view_own"], "lead.view_all")).toBe(false);
  });
});
