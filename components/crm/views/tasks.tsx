"use client";

import { PersonChip } from "@/components/person-chip";
import { CalendarX, Check, Clock, ListChecks, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { TASK_TYPE_LABEL, type Task } from "@/lib/demo/ops-data";
import { ApprovalList, PageHead } from "../parts";
import { useShell } from "../shell-context";
import { fmtDue, useCrm } from "../store";

type Scope = "mine" | "team" | "shared";

// Việc cần làm và hàng chờ duyệt thống nhất (CLAUDE.md mục 4): việc do người tạo, do luật sinh, do AI đề xuất.
export function CrmTasks() {
  const { state, act } = useCrm();
  const { can, me, isOwner } = useShell();
  const router = useRouter();
  const team = can("lead.view_all");
  const [scope, setScope] = useState<Scope>(team ? "team" : "mine");
  const [doneOpen, setDoneOpen] = useState(false);

  const inScope = state.tasks.filter((t) =>
    scope === "mine" ? t.owner === me : scope === "shared" ? t.owner === "" : true,
  );
  const open = inScope.filter((t) => t.status === "open").sort((a, b) => a.due - b.due);
  const overdue = open.filter((t) => t.due < state.minutes);
  const today = open.filter((t) => t.due >= state.minutes && t.due < 1440);
  const later = open.filter((t) => t.due >= 1440);
  const closed = inScope.filter((t) => t.status !== "open");
  const approvals = state.queue.filter((q) => can(q.perm) && (q.requestedBy !== me || isOwner));
  const mineWaiting = state.queue.filter((q) => q.requestedBy === me);

  function openTask(t: Task) {
    // Việc gắn đơn mở hồ sơ đơn; việc gắn lead mở hồ sơ lead.
    if (t.orderId) router.push(`/orders/${t.orderId}`);
    else if (t.oppId) {
      act({ type: "selectOpp", id: t.oppId });
      router.push("/opportunities");
    }
  }

  const group = (title: string, list: Task[], tone?: string) =>
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
            <TaskRow key={t.id} t={t} onOpen={() => openTask(t)} overdue={t.due < state.minutes} />
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
            <strong className={approvals.length ? "text-warn" : undefined}>{approvals.length}</strong>
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
            <ApprovalList items={approvals} />
          </section>
          {mineWaiting.length ? (
            <section className="c-card">
              <div className="c-ch">
                <h2>Tôi đang chờ người khác duyệt</h2>
              </div>
              <ul className="m-0 list-none px-3.5 pb-3">
                {mineWaiting.map((q) => (
                  <li key={q.id} className="py-1">
                    {q.text}
                    <div className="c-lbl">{q.why}</div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TaskRow({ t, onOpen, overdue }: { t: Task; onOpen: () => void; overdue: boolean }) {
  const { act } = useCrm();
  const { me, can } = useShell();
  const [outcome, setOutcome] = useState("");
  const [closing, setClosing] = useState(false);
  const mine = t.owner === me || (t.owner === "" && can("lead.view_all"));
  const open = t.status === "open";
  return (
    // Đổi khóa khi việc vừa thay đổi để dòng gắn lại và nháy màu một lần (DESIGN.md: phản hồi tức thì).
    <li
      key={`${t.id}-${t.flash ?? 0}`}
      className={`c-hrow border-t border-line-2 py-2 first:border-t-0 ${t.flash ? "c-flash" : ""}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className={`c-pill ${overdue ? "is-err" : t.priority === "high" ? "is-warn" : "is-n"}`}>
          {fmtDue(t.due)}
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="c-link font-semibold"
            onClick={onOpen}
            disabled={!t.oppId && !t.orderId}
          >
            {t.title}
          </button>
          <div className="c-lbl">
            {TASK_TYPE_LABEL[t.type]} · {t.owner ? <PersonChip name={t.owner} weak /> : "Hàng chung"} ·{" "}
            {t.source === "rule" ? "Luật tự sinh" : t.source === "ai" ? "AI đề xuất" : "Người tạo"}
          </div>
        </div>
        {mine && open && !closing ? (
          // Thanh nút hiện khi rê chuột hoặc khi dòng có tiêu điểm bàn phím, như thanh thao tác tin nhắn Slack.
          <span className="c-hacts" role="group" aria-label={`Thao tác: ${t.title}`}>
            <button
              type="button"
              aria-label="Xong"
              title="Xong"
              onClick={() =>
                act({ type: "completeTask", id: t.id, outcome: "", actor: me }, "Đã xong việc", {
                  undo: true,
                })
              }
            >
              <Check size={16} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Dời 1 giờ"
              title="Dời 1 giờ"
              onClick={() =>
                act({ type: "snoozeTask", id: t.id, minutes: 60, actor: me }, "Đã dời việc 1 giờ", {
                  undo: true,
                })
              }
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
                onClick={() =>
                  act({ type: "missTask", id: t.id, actor: me }, "Đã ghi lỡ hẹn", { undo: true })
                }
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
            act({ type: "completeTask", id: t.id, outcome: outcome.trim(), actor: me }, "Đã xong việc", {
              undo: true,
            });
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
          <button type="submit" className="c-btn is-brand">
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
