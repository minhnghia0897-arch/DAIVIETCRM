import Link from "next/link";

import { DemoBadge } from "@/components/record";
import { requireAnyPermission } from "@/lib/auth/session";

// Đội ngũ (DESIGN.md 6.14): menu riêng, tách khỏi Báo cáo kinh doanh. Tab con chỉ hiện khi có quyền.
export default async function TeamLayout({ children }: LayoutProps<"/team">) {
  const user = await requireAnyPermission(["kpi.own", "kpi.team"]);
  const tabs = [
    user.permissions.has("kpi.team")
      ? { href: "/team", label: "Tổng quan đội" }
      : { href: `/team/people/${user.id}`, label: "Hiệu suất của tôi" },
    ...(user.permissions.has("staff.view") ? [{ href: "/team/staff", label: "Hồ sơ nhân sự" }] : []),
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-3 px-4 py-4">
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
      {children}
    </div>
  );
}
