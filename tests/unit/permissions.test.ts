import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PERMISSIONS, can } from "@/lib/auth/permissions";

const migration = readFileSync("supabase/migrations/20261004000400_reference_data.sql", "utf8");

describe("permissions", () => {
  it("không trùng key", () => {
    expect(new Set(PERMISSIONS.map((p) => p.key)).size).toBe(PERMISSIONS.length);
  });

  it("migration dữ liệu tham chiếu khớp với lib/auth/permissions.ts", () => {
    const generated = execFileSync("node", ["scripts/gen-permission-seed.mts"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    expect(migration).toContain(generated.trim());
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
