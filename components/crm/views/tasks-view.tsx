"use client";

import { PersonChip } from "@/components/person-chip";
import { CalendarX, Check, Clock, ListChecks, PenLine } from "lucide-react";
import { useState, type ReactNode } from "react";

import { PageHead } from "../parts";

// Giao diện màn Việc cần làm dùng chung cho bản thật (tasks-live.tsx) và bản demo (tasks.tsx). File này không đọc
// kho mô phỏng, nên màn thật không phải tải kho đó.

export type Scope = "mine" | "team" | "shared";
export type Result = { ok: boolean; message: string };
export type DueGroup = "overdue" | "today" | "later";
export type TaskStatus = "open" | "done" | "cancelled" | "missed";

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
  /** Mở hồ sơ liên quan (đơn, phiếu kho) để xem trước khi duyệt. */
  href?: string | null;
}

/** Khung nhìn chung của một dòng việc, đổ từ store (demo) hoặc database (bản thật). */
export interface Row {
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

export type RowAction = { kind: "done"; outcome?: string } | { kind: "snooze" } | { kind: "miss" };

export const SOURCE_LABEL = { rule: "Luật tự sinh", ai: "AI đề xuất", user: "Người tạo" } as const;

// Việc cần làm và hàng chờ duyệt thống nhất (CLAUDE.md mục 4): việc do người tạo, do luật sinh, do AI đề xuất.
export function TasksScreen({
  rows,
  scope,
  setScope,
  team,
  busy,
  openRow,
  runAction,
  approveCount,
  approvals,
  waiting,
}: {
  rows: Row[];
  scope: Scope;
  setScope: (s: Scope) => void;
  team: boolean;
  busy: boolean;
  openRow: (id: string) => void;
  runAction: (id: string, a: RowAction) => void;
  approveCount: number;
  approvals: ReactNode;
  waiting: { id: string; text: string; why: string }[];
}) {
  const [doneOpen, setDoneOpen] = useState(false);
  const open = rows.filter((t) => t.status === "open");
  const overdue = open.filter((t) => t.group === "overdue");
  const today = open.filter((t) => t.group === "today");
  const later = open.filter((t) => t.group === "later");
  const closed = rows.filter((t) => t.status !== "open");

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
              busy={busy}
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
            {approvals}
          </section>
          <WaitingList items={waiting} />
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
