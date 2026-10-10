"use client";

import { PersonChip } from "@/components/person-chip";
import { CalendarX, Check, Clock, ListChecks, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { TASK_TYPE_LABEL, type Task } from "@/lib/demo/ops-data";
import { ApprovalList, PageHead } from "../parts";
import { useShell } from "../shell-context";
import { fmtDue, useCrm } from "../store";

type Scope = "mine" | "team" | "shared";
type Result = { ok: boolean; message: string };
type DueGroup = "overdue" | "today" | "later";
type TaskStatus = "open" | "done" | "cancelled" | "missed";

/** Một việc đọc từ database (bản thật). Hạn đã tính sẵn ở server theo giờ VN. */
export interface LiveTask {
  id: string;
  type: string;
  title: string;
  href: string | null;
  ownerName: string;
  mine: boolean;
  shared: boolean;
  group: DueGroup;
  dueLabel: string;
  high: boolean;
  status: TaskStatus;
  outcome: string | null;
  source: "user" | "rule" | "ai";
}

export interface LiveApproval {
  id: string;
  title: string;
  reason: string;
  requestedBy: string;
  mine: boolean;
}

/**
 * Bản thật: việc và hàng chờ duyệt từ database, thao tác qua server action (task_action, UPDATE approvals).
 * Không có thì màn chạy store mô phỏng như bản demo tĩnh.
 */
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

/** Khung nhìn chung của một dòng việc, đổ từ store (demo) hoặc database (bản thật). */
interface Row {
  id: string;
  title: string;
  typeLabel: string;
  owner: string;
  canAct: boolean;
  group: DueGroup;
  dueLabel: string;
  high: boolean;
  status: TaskStatus;
  outcome?: string | null;
  sourceLabel: string;
  canOpen: boolean;
  flashKey: number;
}

type RowAction = { kind: "done"; outcome?: string } | { kind: "snooze" } | { kind: "miss" };

const SOURCE_LABEL = { rule: "Luật tự sinh", ai: "AI đề xuất", user: "Người tạo" } as const;
const typeLabel = (t: string) => TASK_TYPE_LABEL[t as keyof typeof TASK_TYPE_LABEL] ?? "Việc khác";

const LiveContext = createContext<LiveTasks | null>(null);

// Việc cần làm và hàng chờ duyệt thống nhất (CLAUDE.md mục 4): việc do người tạo, do luật sinh, do AI đề xuất.
export function CrmTasks({ live }: { live?: LiveTasks }) {
  return (
    <LiveContext.Provider value={live ?? null}>
      <TasksBody />
    </LiveContext.Provider>
  );
}

function TasksBody() {
  const live = useContext(LiveContext);
  const { state, act } = useCrm();
  const { can, me, isOwner } = useShell();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const team = can("lead.view_all");
  const [scope, setScope] = useState<Scope>(team ? "team" : "mine");
  const [doneOpen, setDoneOpen] = useState(false);

  // --- Đổ dữ liệu vào khung nhìn chung ---
  let rows: Row[];
  let openRow: (id: string) => void;
  let runAction: (id: string, a: RowAction) => void;

  if (live) {
    const byId = new Map(live.tasks.map((t) => [t.id, t]));
    rows = live.tasks
      .filter((t) => (scope === "mine" ? t.mine : scope === "shared" ? t.shared : true))
      .map((t) => ({
        id: t.id,
        title: t.title,
        typeLabel: typeLabel(t.type),
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
      }));
    openRow = (id) => {
      const href = byId.get(id)?.href;
      if (href) router.push(href);
    };
    runAction = (id, a) =>
      start(async () => {
        try {
          const r = await live.taskAction({
            id,
            action: a.kind,
            minutes: a.kind === "snooze" ? 60 : undefined,
            outcome: a.kind === "done" ? a.outcome : undefined,
          });
          toast(r.message, r.ok ? "ok" : "err");
        } catch {
          toast("Chưa lưu được, thử lại sau ít phút.", "err");
        }
      });
  } else {
    const byId = new Map(state.tasks.map((t) => [t.id, t]));
    rows = state.tasks
      .filter((t) => (scope === "mine" ? t.owner === me : scope === "shared" ? t.owner === "" : true))
      .map((t: Task) => ({
        id: t.id,
        title: t.title,
        typeLabel: typeLabel(t.type),
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
    openRow = (id) => {
      // Việc gắn đơn mở hồ sơ đơn; việc gắn lead mở hồ sơ lead.
      const t = byId.get(id);
      if (t?.orderId) router.push(`/orders/${t.orderId}`);
      else if (t?.oppId) {
        act({ type: "selectOpp", id: t.oppId });
        router.push("/opportunities");
      }
    };
    runAction = (id, a) => {
      if (a.kind === "done")
        act({ type: "completeTask", id, outcome: a.outcome ?? "", actor: me }, "Đã xong việc", {
          undo: true,
        });
      else if (a.kind === "snooze")
        act({ type: "snoozeTask", id, minutes: 60, actor: me }, "Đã dời việc 1 giờ", { undo: true });
      else act({ type: "missTask", id, actor: me }, "Đã ghi lỡ hẹn", { undo: true });
    };
  }

  const open = rows.filter((t) => t.status === "open");
  const overdue = open.filter((t) => t.group === "overdue");
  const today = open.filter((t) => t.group === "today");
  const later = open.filter((t) => t.group === "later");
  const closed = rows.filter((t) => t.status !== "open");
  const demoApprovals = state.queue.filter((q) => can(q.perm) && (q.requestedBy !== me || isOwner));
  const approveCount = live ? live.toApprove.length : demoApprovals.length;

  const group = (title: string, list: Row[], tone?: string) =>
    list.length ? (
      <section className="c-card" aria-label={title}>
        <div className="c-ch">
          <h2>{title}</h2>
          <span className="c-r">
            <span className={`c-pill ${tone ?? "is-n"}`}>{list.length}</span>
          </span>
        </div>
        <ul className="m-0 list-none px-3.5 pb-2">
          {list.map((t) => (
            <TaskRow
              key={t.id}
              t={t}
              busy={pending}
              onOpen={() => openRow(t.id)}
              onAction={(a) => runAction(t.id, a)}
            />
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="c-stack c-flat">
      <section className="c-card">
        <PageHead icon={ListChecks} color="var(--obj-call)" kicker="Việc và duyệt" title="Việc cần làm">
          <div className="c-ftabs" role="tablist" aria-label="Phạm vi">
            {(
              [
                ["mine", "Của tôi"],
                ...(team
                  ? ([
                      ["team", "Cả đội"],
                      ["shared", "Hàng chung"],
                    ] as const)
                  : []),
              ] as [Scope, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={scope === k}
                className="c-ftab"
                onClick={() => setScope(k)}
              >
                {l}
              </button>
            ))}
          </div>
        </PageHead>
        <div className="c-kpis">
          <div>
            <span className="c-lbl">Quá hạn</span>
            <strong className={overdue.length ? "text-err" : undefined}>{overdue.length}</strong>
          </div>
          <div>
            <span className="c-lbl">Còn lại hôm nay</span>
            <strong>{today.length}</strong>
          </div>
          <div>
            <span className="c-lbl">Sắp tới</span>
            <strong>{later.length}</strong>
          </div>
          <div>
            <span className="c-lbl">Chờ tôi duyệt</span>
            <strong className={approveCount ? "text-warn" : undefined}>{approveCount}</strong>
          </div>
        </div>
      </section>

      <div className="c-g84">
        <div className="c-stack">
          {group("Quá hạn", overdue, "is-err")}
          {group("Hôm nay", today)}
          {group("Sắp tới", later)}
          {!open.length ? (
            <p className="c-card c-empty">Hết việc đang mở. Việc mới và hẹn gọi lại sẽ hiện ở đây.</p>
          ) : null}
          {closed.length ? (
            <section className="c-card">
              <div className="c-ch">
                <h2>Đã xử lý</h2>
                <span className="c-r">
                  <button type="button" className="c-link text-label" onClick={() => setDoneOpen((v) => !v)}>
                    {doneOpen ? "Ẩn" : `Xem ${closed.length}`}
                  </button>
                </span>
              </div>
              {doneOpen ? (
                <ul className="m-0 list-none px-3.5 pb-2">
                  {closed.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap gap-1.5 border-t border-line-2 py-1.5 first:border-t-0"
                    >
                      <span
                        className={`c-pill ${t.status === "done" ? "is-ok" : t.status === "missed" ? "is-err" : "is-n"}`}
                      >
                        {t.status === "done" ? "Xong" : t.status === "missed" ? "Lỡ hẹn" : "Đã hủy"}
                      </span>
                      <span className="min-w-0 flex-1">{t.title}</span>
                      {t.outcome ? <span className="c-lbl">{t.outcome}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
        <div className="c-stack">
          <section className="c-card" aria-label="Hàng chờ duyệt">
            <div className="c-ch">
              <h2>Chờ tôi duyệt</h2>
            </div>
            {live ? <LiveApprovalList items={live.toApprove} /> : <ApprovalList items={demoApprovals} />}
          </section>
          <WaitingList
            items={
              live
                ? live.waiting.map((a) => ({ id: a.id, text: a.title, why: a.reason }))
                : state.queue
                    .filter((q) => q.requestedBy === me)
                    .map((q) => ({ id: q.id, text: q.text, why: q.why }))
            }
          />
        </div>
      </div>
    </div>
  );
}

function WaitingList({ items }: { items: { id: string; text: string; why: string }[] }) {
  if (!items.length) return null;
  return (
    <section className="c-card">
      <div className="c-ch">
        <h2>Tôi đang chờ người khác duyệt</h2>
      </div>
      <ul className="m-0 list-none px-3.5 pb-3">
        {items.map((q) => (
          <li key={q.id} className="py-1">
            {q.text}
            <div className="c-lbl">{q.why}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Hàng chờ duyệt bản thật. Database kiểm quyền theo loại và chặn tự duyệt (trừ Owner, có ghi riêng). */
function LiveApprovalList({ items }: { items: LiveApproval[] }) {
  const live = useContext(LiveContext);
  const toast = useToast();
  const [pending, start] = useTransition();
  if (!items.length) return <p className="c-empty">Không có gì chờ duyệt.</p>;
  const decide = (id: string, ok: boolean) =>
    start(async () => {
      try {
        const r = await live!.decideApproval({ id, ok });
        toast(r.message, r.ok ? "ok" : "err");
      } catch {
        toast("Chưa lưu được quyết định, thử lại sau ít phút.", "err");
      }
    });
  return (
    <div>
      {items.map((a) => (
        <div key={a.id} className="c-appr" aria-label={`${a.title}: ${a.reason}`}>
          <div className="c-lbl">
            {a.title} · {a.requestedBy} đề xuất
          </div>
          <div>{a.reason || "Không có lý do kèm theo"}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="c-btn is-brand"
              disabled={pending}
              onClick={() => decide(a.id, true)}
            >
              Duyệt
            </button>
            <button type="button" className="c-btn" disabled={pending} onClick={() => decide(a.id, false)}>
              Từ chối
            </button>
            {a.mine ? <span className="c-lbl">Anh chị tự đề xuất; lần duyệt này được ghi riêng.</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskRow({
  t,
  busy,
  onOpen,
  onAction,
}: {
  t: Row;
  busy: boolean;
  onOpen: () => void;
  onAction: (a: RowAction) => void;
}) {
  const [outcome, setOutcome] = useState("");
  const [closing, setClosing] = useState(false);
  const open = t.status === "open";
  const overdue = t.group === "overdue";
  return (
    // Đổi khóa khi việc vừa thay đổi để dòng gắn lại và nháy màu một lần (DESIGN.md: phản hồi tức thì).
    <li
      key={`${t.id}-${t.flashKey}`}
      className={`c-hrow border-t border-line-2 py-2 first:border-t-0 ${t.flashKey ? "c-flash" : ""}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className={`c-pill ${overdue ? "is-err" : t.high ? "is-warn" : "is-n"}`}>{t.dueLabel}</span>
        <div className="min-w-0 flex-1">
          <button type="button" className="c-link font-semibold" onClick={onOpen} disabled={!t.canOpen}>
            {t.title}
          </button>
          <div className="c-lbl">
            {t.typeLabel} · {t.owner ? <PersonChip name={t.owner} weak /> : "Hàng chung"} · {t.sourceLabel}
          </div>
        </div>
        {t.canAct && open && !closing ? (
          // Thanh nút hiện khi rê chuột hoặc khi dòng có tiêu điểm bàn phím, như thanh thao tác tin nhắn Slack.
          <span className="c-hacts" role="group" aria-label={`Thao tác: ${t.title}`}>
            <button
              type="button"
              aria-label="Xong"
              title="Xong"
              disabled={busy}
              onClick={() => onAction({ kind: "done" })}
            >
              <Check size={16} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Dời 1 giờ"
              title="Dời 1 giờ"
              disabled={busy}
              onClick={() => onAction({ kind: "snooze" })}
            >
              <Clock size={16} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Xong và ghi kết quả"
              title="Xong và ghi kết quả"
              onClick={() => setClosing(true)}
            >
              <PenLine size={16} aria-hidden />
            </button>
            {overdue ? (
              <button
                type="button"
                aria-label="Lỡ hẹn"
                title="Lỡ hẹn"
                disabled={busy}
                onClick={() => onAction({ kind: "miss" })}
              >
                <CalendarX size={16} aria-hidden />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {closing ? (
        <form
          className="mt-2 flex flex-wrap gap-1.5 pl-1"
          onSubmit={(e) => {
            e.preventDefault();
            onAction({ kind: "done", outcome: outcome.trim() });
            setClosing(false);
          }}
        >
          <input
            aria-label="Kết quả"
            placeholder="Kết quả (không bắt buộc)"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1"
            autoFocus
          />
          <button type="submit" className="c-btn is-brand" disabled={busy}>
            Lưu
          </button>
          <button type="button" className="c-btn" onClick={() => setClosing(false)}>
            Hủy
          </button>
        </form>
      ) : null}
    </li>
  );
}
