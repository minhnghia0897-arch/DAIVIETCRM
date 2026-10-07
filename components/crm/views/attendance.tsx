"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { localTime } from "@/lib/leads/windows";
import { VN_TZ, checkSession, formatMinutes, type ShiftDef } from "@/lib/team/attendance";

// Đội ngũ, Nghỉ và trực trên bản thật (CLAUDE.md mục 9.2): ai đang trực, giờ trực hôm nay so với ca (vào trễ, tắt
// sớm), ngày nghỉ. Chấm công nhẹ để quản lý nhìn, không dùng tính lương.

type Result = { ok: boolean; message: string };

export interface AttendanceActions {
  addAbsence(i: {
    userId: string;
    kind: "annual" | "sick" | "business" | "other";
    startsOn: string;
    endsOn: string;
    note: string;
  }): Promise<Result>;
  cancelAbsence(id: string): Promise<Result>;
  endDutyFor(userId: string): Promise<Result>;
}

interface Person {
  id: string;
  name: string;
  shifts: ShiftDef[];
}
interface Session {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  endSource: string | null;
}
interface Absence {
  id: string;
  userId: string;
  kind: string;
  startsOn: string;
  endsOn: string;
  note: string | null;
}

const KIND: Record<string, string> = {
  annual: "Nghỉ phép",
  sick: "Nghỉ ốm",
  business: "Công tác",
  other: "Khác",
};
const END_SOURCE: Record<string, string> = {
  user: "",
  system: "Hệ thống tắt khi hết ca",
  manager: "Quản lý tắt hộ",
  locked: "Tắt do khóa tài khoản",
};

const hhmm = (iso: string) => localTime(new Date(iso), VN_TZ);
const input = "rounded-control border border-line bg-surface px-2 py-1";

export function AttendanceView({
  now,
  today,
  canManage,
  people,
  sessions,
  absences,
  actions,
}: {
  now: string;
  today: string;
  canManage: boolean;
  people: Person[];
  sessions: Session[];
  absences: Absence[];
  actions: AttendanceActions;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const nowDate = new Date(now);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Người đã nghỉ";
  const shiftsOf = (id: string) => people.find((p) => p.id === id)?.shifts ?? [];
  const open = sessions.filter((s) => !s.endedAt);
  const absentToday = absences.filter((a) => a.startsOn <= today && a.endsOn >= today);

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
    <div className="c-stack">
      <h1 className="sr-only">Đội ngũ: nghỉ và trực</h1>
      <section className="c-card" aria-labelledby="att-on">
        <div className="c-ch">
          <h2 id="att-on">Đang trực ({open.length})</h2>
          {absentToday.length ? (
            <span className="c-lbl ml-auto">
              Nghỉ hôm nay: {absentToday.map((a) => nameOf(a.userId)).join(", ")}
            </span>
          ) : null}
        </div>
        {open.length ? (
          <ul className="m-0 list-none px-2 pb-2">
            {open.map((s) => {
              const c = checkSession(
                { startedAt: new Date(s.startedAt), endedAt: null },
                shiftsOf(s.userId),
                nowDate,
              );
              return (
                <li key={s.id} className="tgx-row">
                  <span className="min-w-0 flex-1">
                    <b>{nameOf(s.userId)}</b>
                    <span className="c-lbl block">
                      Trực từ {hhmm(s.startedAt)} · {formatMinutes(c.workedMin)}
                      {c.shift ? ` · ${c.shift.name}` : " · Ngoài ca"}
                    </span>
                  </span>
                  {c.lateMin ? <span className="c-pill is-warn">Trễ {c.lateMin} phút</span> : null}
                  {canManage ? (
                    <button
                      type="button"
                      className="c-btn"
                      disabled={pending}
                      onClick={() => run(() => actions.endDutyFor(s.userId))}
                    >
                      Tắt trực hộ
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="c-cb m-0 text-text-weak">
            Chưa ai bật Trực. Lead mới sẽ vào hàng Chưa phân cho tới khi có người bật Trực.
          </p>
        )}
      </section>

      <section className="c-card" aria-labelledby="att-today">
        <div className="c-ch">
          <h2 id="att-today">Giờ trực hôm nay</h2>
          <span className="c-lbl ml-auto">Giờ Việt Nam, so với ca đã xếp</span>
        </div>
        {sessions.length ? (
          <div className="c-tw">
            <table className="c-table">
              <thead>
                <tr>
                  <th>Người</th>
                  <th>Ca</th>
                  <th>Bật</th>
                  <th>Tắt</th>
                  <th>Trực thực tế</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const c = checkSession(
                    { startedAt: new Date(s.startedAt), endedAt: s.endedAt ? new Date(s.endedAt) : null },
                    shiftsOf(s.userId),
                    nowDate,
                  );
                  const notes = [
                    c.lateMin ? `Vào trễ ${c.lateMin} phút` : "",
                    c.earlyMin ? `Tắt sớm ${c.earlyMin} phút` : "",
                    END_SOURCE[s.endSource ?? ""] ?? "",
                  ].filter(Boolean);
                  return (
                    <tr key={s.id}>
                      <td>{nameOf(s.userId)}</td>
                      <td>
                        {c.shift
                          ? `${c.shift.name} ${hhmm(c.shift.start.toISOString())}–${hhmm(c.shift.end.toISOString())}`
                          : "Ngoài ca"}
                      </td>
                      <td className="tabular">{hhmm(s.startedAt)}</td>
                      <td className="tabular">{s.endedAt ? hhmm(s.endedAt) : "Đang trực"}</td>
                      <td className="tabular">{formatMinutes(c.workedMin)}</td>
                      <td className={notes.length ? "text-warn" : ""}>{notes.join(" · ") || "Đúng giờ"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="c-cb m-0 text-text-weak">Hôm nay chưa có phiên trực nào.</p>
        )}
      </section>

      <section className="c-card" aria-labelledby="att-abs">
        <div className="c-ch">
          <h2 id="att-abs">Ngày nghỉ</h2>
          <span className="c-lbl ml-auto">Ngày nghỉ thì không bật Trực và không được phân lead</span>
        </div>
        {absences.length ? (
          <ul className="m-0 list-none px-2 pb-2">
            {absences.map((a) => (
              <li key={a.id} className="tgx-row">
                <span className="min-w-0 flex-1">
                  <b>{nameOf(a.userId)}</b> · {KIND[a.kind] ?? a.kind}
                  <span className="c-lbl block">
                    {a.startsOn === a.endsOn
                      ? formatDate(a.startsOn)
                      : `${formatDate(a.startsOn)} – ${formatDate(a.endsOn)}`}
                    {a.note ? ` · ${a.note}` : ""}
                  </span>
                </span>
                {a.startsOn <= today ? <span className="c-pill is-warn">Đang nghỉ</span> : null}
                {canManage ? (
                  <button
                    type="button"
                    className="c-btn"
                    disabled={pending}
                    onClick={() => run(() => actions.cancelAbsence(a.id))}
                  >
                    Hủy
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="c-cb m-0 text-text-weak">Không có ai nghỉ trong thời gian tới.</p>
        )}
        {canManage ? (
          <AbsenceForm
            people={people}
            today={today}
            pending={pending}
            onSubmit={(v, reset) => run(() => actions.addAbsence(v), reset)}
          />
        ) : null}
      </section>
    </div>
  );
}

function AbsenceForm({
  people,
  today,
  pending,
  onSubmit,
}: {
  people: Person[];
  today: string;
  pending: boolean;
  onSubmit: (v: Parameters<AttendanceActions["addAbsence"]>[0], reset: () => void) => void;
}) {
  const empty = {
    userId: people[0]?.id ?? "",
    kind: "annual" as const,
    startsOn: today,
    endsOn: today,
    note: "",
  };
  const [v, setV] = useState<Parameters<AttendanceActions["addAbsence"]>[0]>(empty);
  return (
    <form
      aria-label="Ghi ngày nghỉ"
      className="c-cb flex flex-wrap items-end gap-3 border-t border-line-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v, () => setV(empty));
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="c-lbl">Người nghỉ</span>
        <select className={input} value={v.userId} onChange={(e) => setV({ ...v, userId: e.target.value })}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="c-lbl">Loại</span>
        <select
          className={input}
          value={v.kind}
          onChange={(e) => setV({ ...v, kind: e.target.value as typeof v.kind })}
        >
          {Object.entries(KIND).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="c-lbl">Từ ngày</span>
        <input
          type="date"
          className={input}
          value={v.startsOn}
          onChange={(e) =>
            setV({
              ...v,
              startsOn: e.target.value,
              endsOn: v.endsOn < e.target.value ? e.target.value : v.endsOn,
            })
          }
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="c-lbl">Đến ngày</span>
        <input
          type="date"
          className={input}
          value={v.endsOn}
          min={v.startsOn}
          onChange={(e) => setV({ ...v, endsOn: e.target.value })}
        />
      </label>
      <label className="flex min-w-40 flex-1 flex-col gap-1">
        <span className="c-lbl">Ghi chú</span>
        <input
          className={input}
          value={v.note}
          maxLength={500}
          onChange={(e) => setV({ ...v, note: e.target.value })}
        />
      </label>
      <button type="submit" className="c-btn is-go" disabled={pending || !v.userId}>
        Ghi ngày nghỉ
      </button>
    </form>
  );
}
