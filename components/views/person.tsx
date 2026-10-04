import { notFound } from "next/navigation";

import { SharedCoaching } from "@/components/crm/views/team";
import { Progress } from "@/components/progress";
import { PageHeader } from "@/components/record";
import { TasksBlock } from "@/components/tasks-block";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionUser } from "@/lib/auth/types";
import { staffName, staffTasks, teamKpis, teamMedian } from "@/lib/demo/repo";
import { dueLabel } from "@/lib/demo/time";
import { formatMoneyShort, formatPercent } from "@/lib/format";

export function PersonView({ user, id }: { user: SessionUser; id: string }) {
  // teamKpis đã lọc theo quyền: người chỉ có kpi.own không mở được trang của người khác.
  const k = teamKpis(user).find((x) => x.staffId === id);
  if (!k) notFound();
  const median = teamMedian();
  const isManager = user.permissions.has("kpi.team");
  const tasks = staffTasks(id);

  const metric = (label: string, value: string, teamValue?: string) => (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="text-text-weak">{label}</span>
      <span className="tabular">
        <b>{value}</b>
        {teamValue ? <span className="ml-2 text-label text-text-weak">đội {teamValue}</span> : null}
      </span>
    </div>
  );

  return (
    <>
      <PageHeader
        kind="team"
        label={id === user.id ? "Hiệu suất của tôi" : "Hiệu suất cá nhân"}
        title={k.staff.fullName}
        highlights={[
          { label: "Chức danh", value: k.staff.title },
          { label: "Quản lý", value: staffName(k.staff.managerId ?? "") },
          { label: "Kỳ", value: "Tháng 10, theo kỳ" },
          { label: "Giờ trực tuần này", value: `${k.dutyHoursWeek} / ${k.shiftHoursWeek} giờ` },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Việc cần làm ngay</CardTitle>
        </CardHeader>
        <TasksBlock
          readOnly={Boolean(user.viewAs) || id !== user.id}
          empty="Không có gì chờ duyệt."
          items={tasks.map((t) => {
            const d = dueLabel(t.due);
            return { ...t, dueLabel: d.label, overdue: d.overdue, sub: t.customer.fullName };
          })}
        />
      </Card>
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Kết quả</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-label text-text-weak">Doanh thu đã cọc</p>
            <p className="tabular text-metric font-extrabold">
              {formatMoneyShort(k.revenueDeposit)} / {formatMoneyShort(k.revenueTarget)}
            </p>
            <Progress ratio={k.revenueDeposit / k.revenueTarget} label="Doanh thu so với chỉ tiêu" />
            {metric("Số đơn", String(k.orders))}
            {metric("Giảm trung bình", formatPercent(k.avgDiscount))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tốc độ</CardTitle>
          </CardHeader>
          <CardBody>
            {metric("Gọi trong SLA", formatPercent(k.slaRate), formatPercent(median.slaRate))}
            {metric("Liên hệ đầu (trung vị)", k.medianFirstContact)}
            {metric("Hẹn gọi lại đúng giờ", formatPercent(k.callbackOnTime))}
            {metric("Cuộc gọi mỗi ngày", `${k.callsPerDay} / ${k.callsTarget}`, String(median.callsPerDay))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Chất lượng</CardTitle>
          </CardHeader>
          <CardBody>
            {metric("Đủ 4 thông tin", formatPercent(k.infoRate), formatPercent(median.infoRate))}
            {metric("Chốt (theo lô lead)", formatPercent(k.closeRate), formatPercent(median.closeRate))}
          </CardBody>
        </Card>
      </div>
      {isManager ? (
        <Card>
          <CardHeader>
            <CardTitle>Tuân thủ và cảnh báo</CardTitle>
            <span className="text-label text-text-weak">Chỉ quản lý thấy</span>
          </CardHeader>
          <CardBody>
            {k.alerts.length ? (
              <ul className="list-disc pl-5 text-warn">
                {k.alerts.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : (
              <p className="text-text-weak">Mọi thứ ổn, không có cảnh báo.</p>
            )}
          </CardBody>
        </Card>
      ) : null}
      <SharedCoaching staffId={id} />
    </>
  );
}
