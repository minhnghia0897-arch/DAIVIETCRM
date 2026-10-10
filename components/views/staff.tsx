import { PersonChip } from "@/components/person-chip";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import type { SessionUser } from "@/lib/auth/types";
import { staffName, visibleStaff } from "@/lib/demo/repo";
import { formatDate } from "@/lib/format";

const STATUS = {
  probation: { label: "Thử việc", tone: "warn" as const },
  active: { label: "Chính thức", tone: "ok" as const },
  on_leave: { label: "Nghỉ dài", tone: "neutral" as const },
  offboarded: { label: "Đã nghỉ", tone: "neutral" as const },
};

// Hồ sơ làm việc (CLAUDE.md 9.1): không có giấy tờ tùy thân, tài khoản ngân hàng hay lương.
export function StaffView({ user }: { user: SessionUser }) {
  const rows = visibleStaff(user);
  return (
    <>
      <h1 className="sr-only">Đội ngũ: hồ sơ nhân sự</h1>
      <Card>
        <CardHeader>
          <CardTitle>Hồ sơ nhân sự</CardTitle>
          <span className="text-label text-text-weak">{rows.length} người</span>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead className="border-b border-line bg-surface text-left text-label text-text-weak">
              <tr>
                <th className="px-[14px] py-2 font-semibold">Mã</th>
                <th className="px-3 py-2 font-semibold">Tên</th>
                <th className="px-3 py-2 font-semibold">Chức danh</th>
                <th className="px-3 py-2 font-semibold">Quản lý</th>
                <th className="px-3 py-2 font-semibold">Vào làm</th>
                <th className="px-3 py-2 font-semibold">Trạng thái</th>
                <th className="px-3 py-2 font-semibold">Kỹ năng</th>
                <th className="px-3 py-2 font-semibold">Trực</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="h-10 border-t border-line-2 hover:bg-surface-2">
                  <td className="tabular px-[14px] py-1">{s.code}</td>
                  <td className="px-3 py-1 font-semibold">
                    <PersonChip name={s.fullName} />
                  </td>
                  <td className="px-3 py-1">{s.title}</td>
                  <td className="px-3 py-1">{s.managerId ? staffName(s.managerId) : "—"}</td>
                  <td className="tabular px-3 py-1">{formatDate(s.joinedAt)}</td>
                  <td className="px-3 py-1">
                    <Pill tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Pill>
                  </td>
                  <td className="px-3 py-1">{s.skills.join(", ")}</td>
                  <td className="px-3 py-1">
                    {s.onDuty ? <Pill tone="ok">Đang trực</Pill> : <Pill>Nghỉ</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
