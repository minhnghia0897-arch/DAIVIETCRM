import Link from "next/link";

import { DemoBadge } from "@/components/record";
import type { SessionUser } from "@/lib/auth/types";

// Tab con của Đội ngũ (DESIGN.md 6.14): chỉ hiện khi có quyền.
export function TeamNav({ user }: { user: SessionUser }) {
  const tabs = [
    user.permissions.has("kpi.team")
      ? { href: "/team", label: "Tổng quan đội" }
      : { href: `/team/people/${user.id}`, label: "Hiệu suất của tôi" },
    ...(user.permissions.has("staff.view") ? [{ href: "/team/staff", label: "Hồ sơ nhân sự" }] : []),
  ];
  return (
    <nav aria-label="Đội ngũ" className="flex flex-wrap items-center gap-1.5">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="rounded-pill border border-line bg-surface px-3 py-1 text-pill font-semibold"
        >
          {t.label}
        </Link>
      ))}
      <span className="ml-auto">
        <DemoBadge />
      </span>
    </nav>
  );
}
