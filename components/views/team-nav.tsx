import { FilterTabs } from "@/components/filter-tabs";
import { DemoBadgeAuto } from "@/components/demo-badge-auto";
import { DemoBadge } from "@/components/record";
import type { SessionUser } from "@/lib/auth/types";

// Tab con của Đội ngũ (DESIGN.md 6.14): chỉ hiện khi có quyền.
export function TeamNav({ user, allDemo }: { user: SessionUser; allDemo?: boolean }) {
  const tabs = [
    user.permissions.has("kpi.team")
      ? { href: "/team", label: "Tổng quan đội" }
      : { href: `/team/people/${user.id}`, label: "Hiệu suất của tôi" },
    ...(user.permissions.has("target.manage") || user.permissions.has("kpi.team")
      ? [{ href: "/team/targets", label: "Chỉ tiêu" }]
      : []),
    ...(user.permissions.has("staff.manage") || user.permissions.has("attendance.view_team")
      ? [{ href: "/team/absences", label: "Nghỉ và trực" }]
      : []),
    ...(user.permissions.has("staff.view") ? [{ href: "/team/staff", label: "Hồ sơ nhân sự" }] : []),
    ...(user.permissions.has("coaching.manage") ? [{ href: "/team/coaching", label: "Kèm cặp" }] : []),
    ...(user.permissions.has("staff.offboard") ? [{ href: "/team/offboarding", label: "Bàn giao" }] : []),
  ];
  return (
    <FilterTabs label="Đội ngũ" tabs={tabs}>
      {allDemo ? <DemoBadge /> : <DemoBadgeAuto />}
    </FilterTabs>
  );
}
