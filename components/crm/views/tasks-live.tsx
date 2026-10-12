"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/ui/toast";
import { TASK_TYPE_LABEL } from "@/lib/leads/activity";
import { navStart } from "@/lib/nav-progress";
import { useShell } from "../shell-context";
import {
  SOURCE_LABEL,
  TasksScreen,
  type LiveApproval,
  type LiveTask,
  type Result,
  type Row,
  type RowAction,
  type Scope,
} from "./tasks-view";

export type { LiveApproval, LiveTask } from "./tasks-view";

/** Việc và hàng chờ duyệt từ database, thao tác qua server action (task_action, UPDATE approvals). */
export interface LiveTasks {
  tasks: LiveTask[];
  toApprove: LiveApproval[];
  waiting: LiveApproval[];
  taskAction: (input: {
    id: string;
    action: "done" | "snooze" | "miss";
    minutes?: number;
    outcome?: string;
  }) => Promise<Result>;
  decideApproval: (input: { id: string; ok: boolean }) => Promise<Result>;
}

type Patch = { change: Partial<Row>; saving: boolean };

// Màn Việc cần làm bản thật. Bấm Xong, Dời, Lỡ hẹn thì dòng đổi ngay trên màn rồi mới lưu; lưu lỗi thì trả lại như
// cũ và báo lý do. Dữ liệu mới từ server (sau khi lưu) thay cho bản đổi tạm.
export function TasksLive({ live }: { live: LiveTasks }) {
  const { can } = useShell();
  const router = useRouter();
  const toast = useToast();
  const team = can("lead.view_all");
  const [scope, setScope] = useState<Scope>(team ? "team" : "mine");
  const [patches, setPatches] = useState<Record<string, Patch>>({});
  const [seen, setSeen] = useState(live.tasks);
  if (seen !== live.tasks) {
    setSeen(live.tasks);
    // Giữ bản tạm của việc còn đang lưu; việc đã lưu xong thì dữ liệu server đã đúng.
    setPatches((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v.saving)));
  }

  const byId = new Map(live.tasks.map((t) => [t.id, t]));
  const rows: Row[] = live.tasks
    .filter((t) => (scope === "mine" ? t.mine : scope === "shared" ? t.shared : true))
    .map((t) => ({
      id: t.id,
      title: t.title,
      typeLabel: TASK_TYPE_LABEL[t.type] ?? "Việc khác",
      owner: t.ownerName,
      // Cùng luật với database: việc của mình, hoặc người có quyền giao việc.
      canAct: t.mine || can("lead.assign"),
      group: t.group,
      dueLabel: t.dueLabel,
      high: t.high,
      status: t.status,
      outcome: t.outcome,
      sourceLabel: SOURCE_LABEL[t.source],
      canOpen: Boolean(t.href),
      flashKey: 0,
      ...patches[t.id]?.change,
    }));

  function runAction(id: string, a: RowAction) {
    const t = byId.get(id);
    if (!t) return;
    const change: Partial<Row> =
      a.kind === "done"
        ? { status: "done", outcome: a.outcome || null }
        : a.kind === "miss"
          ? { status: "missed" }
          : { group: t.group === "overdue" ? "today" : t.group, dueLabel: "Dời 1 giờ", flashKey: Date.now() };
    setPatches((p) => ({ ...p, [id]: { change, saving: true } }));
    void (async () => {
      let r: Result;
      try {
        r = await live.taskAction({
          id,
          action: a.kind,
          minutes: a.kind === "snooze" ? 60 : undefined,
          outcome: a.kind === "done" ? a.outcome : undefined,
        });
      } catch {
        r = { ok: false, message: "Chưa lưu được, thử lại sau ít phút." };
      }
      setPatches((p) => {
        const next = { ...p };
        if (r.ok && next[id]) next[id] = { ...next[id], saving: false };
        else delete next[id];
        return next;
      });
      toast(r.message, r.ok ? "ok" : "err");
    })();
  }

  return (
    <TasksScreen
      rows={rows}
      scope={scope}
      setScope={setScope}
      team={team}
      busy={false}
      openRow={(id) => {
        const href = byId.get(id)?.href;
        if (!href) return;
        navStart();
        router.push(href);
      }}
      runAction={runAction}
      approveCount={live.toApprove.length}
      approvals={<LiveApprovalList items={live.toApprove} decide={live.decideApproval} />}
      waiting={live.waiting.map((a) => ({ id: a.id, text: a.title, why: a.reason }))}
    />
  );
}

/** Hàng chờ duyệt bản thật. Database kiểm quyền theo loại và chặn tự duyệt (trừ Owner, có ghi riêng). */
function LiveApprovalList({ items, decide }: { items: LiveApproval[]; decide: LiveTasks["decideApproval"] }) {
  const toast = useToast();
  // Đề xuất vừa bấm Duyệt hoặc Từ chối ẩn ngay; lưu lỗi thì hiện lại.
  const [hidden, setHidden] = useState<string[]>([]);
  const shown = items.filter((a) => !hidden.includes(a.id));
  if (!shown.length) return <p className="c-empty">Không có gì chờ duyệt.</p>;
  const run = (id: string, ok: boolean) => {
    setHidden((h) => [...h, id]);
    void (async () => {
      let r: Result;
      try {
        r = await decide({ id, ok });
      } catch {
        r = { ok: false, message: "Chưa lưu được quyết định, thử lại sau ít phút." };
      }
      if (!r.ok) setHidden((h) => h.filter((x) => x !== id));
      toast(r.message, r.ok ? "ok" : "err");
    })();
  };
  return (
    <div>
      {shown.map((a) => (
        <div key={a.id} className="c-appr" aria-label={`${a.title}: ${a.reason}`}>
          <div className="c-lbl">
            {a.title} · {a.requestedBy} đề xuất
          </div>
          <div>
            {a.reason || "Không có lý do kèm theo"}
            {a.href ? (
              <>
                {" "}
                <Link href={a.href} className="c-link">
                  Mở để xem
                </Link>
              </>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button type="button" className="c-btn is-brand" onClick={() => run(a.id, true)}>
              Duyệt
            </button>
            <button type="button" className="c-btn" onClick={() => run(a.id, false)}>
              Từ chối
            </button>
            {a.mine ? <span className="c-lbl">Anh chị tự đề xuất; lần duyệt này được ghi riêng.</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
