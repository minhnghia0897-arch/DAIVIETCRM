"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";

// Cài đặt, Ca trực trên bản thật (CLAUDE.md mục 7): sửa tên, ngày, giờ ca (giờ VN), bật tắt ca, xếp người vào ca.
// Người đã được xếp ca thì hệ thống tự tắt Trực khi hết ca cộng 30 phút.

type Result = { ok: boolean; message: string };

export interface ShiftRow {
  id: string;
  name: string;
  days: number[];
  start: string;
  end: string;
  isActive: boolean;
  members: string[];
}

export interface ShiftActions {
  saveShift(i: {
    id?: string;
    name: string;
    days: number[];
    start: string;
    end: string;
    isActive: boolean;
  }): Promise<Result>;
  setShiftMember(i: { shiftId: string; userId: string; on: boolean }): Promise<Result>;
}

const DAYS: [number, string][] = [
  [1, "T2"],
  [2, "T3"],
  [3, "T4"],
  [4, "T5"],
  [5, "T6"],
  [6, "T7"],
  [7, "CN"],
];

const input = "rounded-control border border-line bg-surface px-2 py-1";

export function ShiftEditor({
  shifts,
  people,
  readOnly,
  actions,
}: {
  shifts: ShiftRow[];
  people: { id: string; name: string }[];
  readOnly: boolean;
  actions: ShiftActions;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="c-stack">
      <section className="c-card c-cb">
        <h2 className="m-0 text-card-title font-bold">Ca trực</h2>
        <p className="c-lbl mb-0 mt-1">
          Giờ Việt Nam. Lead chỉ được phân cho người đang bật Trực. Người đã xếp ca thì hệ thống tự tắt Trực
          khi hết ca 30 phút; người chưa xếp ca nào thì tự tắt sau 14 giờ. Khung gọi tốt của từng thị trường
          sửa ở Cài đặt, Thị trường (ví dụ khách ở Hàn 19:00–22:30 giờ Hàn, tức 17:00–20:30 giờ VN).
        </p>
      </section>
      {shifts.map((s) => (
        <ShiftCard key={s.id} shift={s} people={people} readOnly={readOnly} actions={actions} />
      ))}
      {adding ? (
        <ShiftCard
          shift={{
            id: "",
            name: "",
            days: [1, 2, 3, 4, 5, 6],
            start: "08:30",
            end: "17:30",
            isActive: true,
            members: [],
          }}
          people={people}
          readOnly={readOnly}
          actions={actions}
          onDone={() => setAdding(false)}
        />
      ) : readOnly ? null : (
        <div>
          <button
            type="button"
            className="c-btn inline-flex items-center gap-1"
            onClick={() => setAdding(true)}
          >
            <Plus size={15} aria-hidden /> Thêm ca
          </button>
        </div>
      )}
    </div>
  );
}

function ShiftCard({
  shift,
  people,
  readOnly,
  actions,
  onDone,
}: {
  shift: ShiftRow;
  people: { id: string; name: string }[];
  readOnly: boolean;
  actions: ShiftActions;
  onDone?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const isNew = !shift.id;
  const [draft, setDraft] = useState({
    name: shift.name,
    days: shift.days,
    start: shift.start,
    end: shift.end,
    isActive: shift.isActive,
  });
  const dirty =
    isNew ||
    draft.name !== shift.name ||
    draft.start !== shift.start ||
    draft.end !== shift.end ||
    draft.isActive !== shift.isActive ||
    [...draft.days].sort().join() !== [...shift.days].sort().join();
  const label = shift.name || "Ca mới";

  function run(fn: () => Promise<Result>, after?: () => void) {
    start(async () => {
      const r = await fn();
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <section className="c-card c-cb" aria-label={label}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="c-lbl">Tên ca</span>
          <input
            className={input}
            value={draft.name}
            maxLength={60}
            disabled={readOnly}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="c-lbl">Bắt đầu</span>
          <input
            type="time"
            aria-label={`${label} bắt đầu`}
            className={input}
            value={draft.start}
            disabled={readOnly}
            onChange={(e) => setDraft({ ...draft, start: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="c-lbl">Kết thúc</span>
          <input
            type="time"
            aria-label={`${label} kết thúc`}
            className={input}
            value={draft.end}
            disabled={readOnly}
            onChange={(e) => setDraft({ ...draft, end: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-1.5 pb-1">
          <Switch
            label={`${label} đang dùng`}
            checked={draft.isActive}
            disabled={readOnly}
            onCheckedChange={(v) => setDraft({ ...draft, isActive: v })}
          />
          <span>{draft.isActive ? "Đang dùng" : "Tạm tắt"}</span>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label={`${label}: ngày trong tuần`}>
        {DAYS.map(([d, l]) => {
          const on = draft.days.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              disabled={readOnly}
              className={`c-btn ${on ? "is-brand" : ""}`}
              onClick={() =>
                setDraft({ ...draft, days: on ? draft.days.filter((x) => x !== d) : [...draft.days, d] })
              }
            >
              {l}
            </button>
          );
        })}
      </div>
      {dirty && !readOnly ? (
        <div className="mt-3 flex gap-1.5">
          <button
            type="button"
            className="c-btn is-go"
            disabled={pending}
            onClick={() =>
              run(() => actions.saveShift({ ...(isNew ? {} : { id: shift.id }), ...draft }), onDone)
            }
          >
            {isNew ? "Thêm ca" : "Lưu ca"}
          </button>
          <button
            type="button"
            className="c-btn"
            onClick={() =>
              isNew
                ? onDone?.()
                : setDraft({
                    name: shift.name,
                    days: shift.days,
                    start: shift.start,
                    end: shift.end,
                    isActive: shift.isActive,
                  })
            }
          >
            Hủy
          </button>
        </div>
      ) : null}
      {isNew ? null : (
        <div className="mt-3">
          <span className="c-lbl">Người trong ca</span>
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={`${label}: người trong ca`}>
            {people.map((p) => {
              const on = shift.members.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  disabled={readOnly || pending}
                  className={`c-btn ${on ? "is-brand" : ""}`}
                  onClick={() =>
                    run(() => actions.setShiftMember({ shiftId: shift.id, userId: p.id, on: !on }))
                  }
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
