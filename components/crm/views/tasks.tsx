"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { TASK_TYPE_LABEL, type Task } from "@/lib/demo/ops-data";
import { ApprovalList } from "../parts-demo";
import { useShell } from "../shell-context";
import { fmtDue, useCrm } from "../store";
import { SOURCE_LABEL, TasksScreen, type Row, type Scope } from "./tasks-view";

// Màn Việc cần làm bản demo tĩnh: chạy kho mô phỏng. Bản thật dùng tasks-live.tsx (không tải kho này).
export function CrmTasks() {
  const { state, act } = useCrm();
  const { can, me, isOwner } = useShell();
  const router = useRouter();
  const team = can("lead.view_all");
  const [scope, setScope] = useState<Scope>(team ? "team" : "mine");

  const byId = new Map(state.tasks.map((t) => [t.id, t]));
  const rows: Row[] = state.tasks
    .filter((t) => (scope === "mine" ? t.owner === me : scope === "shared" ? t.owner === "" : true))
    .map((t: Task) => ({
      id: t.id,
      title: t.title,
      typeLabel: TASK_TYPE_LABEL[t.type] ?? "Việc khác",
      owner: t.owner,
      canAct: t.owner === me || (t.owner === "" && can("lead.view_all")),
      group: t.due < state.minutes ? "overdue" : t.due < 1440 ? "today" : "later",
      dueLabel: fmtDue(t.due),
      high: t.priority === "high",
      status: t.status,
      outcome: t.outcome,
      sourceLabel: SOURCE_LABEL[t.source],
      canOpen: Boolean(t.oppId || t.orderId),
      flashKey: t.flash ?? 0,
    }));
  const demoApprovals = state.queue.filter((q) => can(q.perm) && (q.requestedBy !== me || isOwner));

  return (
    <TasksScreen
      rows={rows}
      scope={scope}
      setScope={setScope}
      team={team}
      busy={false}
      openRow={(id) => {
        // Việc gắn đơn mở hồ sơ đơn; việc gắn lead mở hồ sơ lead.
        const t = byId.get(id);
        if (t?.orderId) router.push(`/orders/${t.orderId}`);
        else if (t?.oppId) {
          act({ type: "selectOpp", id: t.oppId });
          router.push("/opportunities");
        }
      }}
      runAction={(id, a) => {
        if (a.kind === "done")
          act({ type: "completeTask", id, outcome: a.outcome ?? "", actor: me }, "Đã xong việc", {
            undo: true,
          });
        else if (a.kind === "snooze")
          act({ type: "snoozeTask", id, minutes: 60, actor: me }, "Đã dời việc 1 giờ", { undo: true });
        else act({ type: "missTask", id, actor: me }, "Đã ghi lỡ hẹn", { undo: true });
      }}
      approveCount={demoApprovals.length}
      approvals={<ApprovalList items={demoApprovals} />}
      waiting={state.queue
        .filter((q) => q.requestedBy === me)
        .map((q) => ({ id: q.id, text: q.text, why: q.why }))}
    />
  );
}
