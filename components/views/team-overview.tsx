import Link from "next/link";
import { redirect } from "next/navigation";

import { Progress } from "@/components/progress";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionUser } from "@/lib/auth/types";
import { teamKpis } from "@/lib/demo/repo";
import { formatMoneyShort, formatPercent } from "@/lib/format";

export function TeamOverviewView({ user }: { user: SessionUser }) {
  if (!user.permissions.has("kpi.team")) redirect(`/team/people/${user.id}`);
  const rows = teamKpis(user);
  const revenue = rows.reduce((s, k) => s + k.revenueDeposit, 0);
  const target = rows.reduce((s, k) => s + k.revenueTarget, 0);
  const avg = (f: (k: (typeof rows)[number]) => number) => rows.reduce((s, k) => s + f(k), 0) / rows.length;
  const showNames = user.permissions.has("kpi.leaderboard");

  return (
    <>
      <h1 className="sr-only">Đội ngũ</h1>
      <Card>
        <CardHeader>
          <CardTitle>Tháng 10, theo kỳ, telesale</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="Doanh thu đã cọc"
            value={`${formatMoneyShort(revenue)} / ${formatMoneyShort(target)}`}
            sub={formatPercent(revenue / target)}
          />
          <Metric label="Gọi trong SLA" value={formatPercent(avg((k) => k.slaRate))} />
          <Metric label="Đủ 4 thông tin" value={formatPercent(avg((k) => k.infoRate))} />
          <Metric label="Chốt (theo lô lead)" value={formatPercent(avg((k) => k.closeRate))} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Từng người</CardTitle>
          <span className="text-label text-text-weak">Tô màu theo chỉ tiêu, không theo thứ hạng</span>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="bg-surface-2 text-left">
              <tr>
                <th className="px-[14px] py-2 font-semibold">Người</th>
                <th className="px-3 py-2 font-semibold">Trực</th>
                <th className="px-3 py-2 font-semibold">Doanh thu đã cọc</th>
                <th className="px-3 py-2 text-right font-semibold">Đơn</th>
                <th className="px-3 py-2 text-right font-semibold">Cuộc gọi/ngày</th>
                <th className="px-3 py-2 text-right font-semibold">SLA</th>
                <th className="px-3 py-2 text-right font-semibold">Đủ thông tin</th>
                <th className="px-3 py-2 text-right font-semibold">Chốt</th>
                <th className="px-3 py-2 font-semibold">Cảnh báo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k, i) => (
                <tr key={k.staffId} className="h-11 border-t border-line-2 hover:bg-surface-2">
                  <td className="px-[14px] py-1">
                    <Link href={`/team/people/${k.staffId}`} className="font-semibold text-brand">
                      {showNames ? k.staff.fullName : `Nhân viên ${i + 1}`}
                    </Link>
                  </td>
                  <td className="px-3 py-1">{k.staff.onDuty ? "Đang trực" : "Nghỉ"}</td>
                  <td className="px-3 py-1">
                    <div className="flex items-center gap-3">
                      <Progress
                        ratio={k.revenueDeposit / k.revenueTarget}
                        label="Doanh thu so với chỉ tiêu"
                      />
                      <span className="tabular">{formatMoneyShort(k.revenueDeposit)}</span>
                    </div>
                  </td>
                  <td className="tabular px-3 py-1 text-right">{k.orders}</td>
                  <td className="tabular px-3 py-1 text-right">
                    {k.callsPerDay} / {k.callsTarget}
                  </td>
                  <td className="tabular px-3 py-1 text-right">{formatPercent(k.slaRate)}</td>
                  <td className="tabular px-3 py-1 text-right">{formatPercent(k.infoRate)}</td>
                  <td className="tabular px-3 py-1 text-right">{formatPercent(k.closeRate)}</td>
                  <td className="px-3 py-1 text-label text-warn">
                    {k.alerts.join("; ") || <span className="text-text-weak">—</span>}
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

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-label text-text-weak">{label}</p>
      <p className="tabular text-metric font-light">{value}</p>
      {sub ? <p className="tabular text-label text-text-weak">{sub} chỉ tiêu</p> : null}
    </div>
  );
}
