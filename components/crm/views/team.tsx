"use client";

import { useState } from "react";

import { KPIS, STAFF } from "@/lib/demo/data";
import { useShell } from "../shell-context";
import { staffShort, useCrm, vnd, type CoachingNote } from "../store";

// Đội ngũ (CLAUDE.md mục 9): chỉ tiêu, nghỉ, kèm cặp, bàn giao khi nghỉ việc. Không phải phần mềm nhân sự, tiền lương.

const field = "rounded-control border border-line bg-surface px-2 py-1.5 text-text";
const dmy = (d: string) => d.split("-").reverse().join("/");

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="c-card" aria-label={title}>
      <div className="c-ch">
        <h2>{title}</h2>
        {note ? <span className="c-r c-lbl">{note}</span> : null}
      </div>
      <div className="c-cb">{children}</div>
    </section>
  );
}

/** Người mà quản lý được xem chỉ số, ghi chú: Owner thấy tất cả; người khác thấy người mình quản lý trực tiếp và telesale. */
function useManaged() {
  const { isOwner, userId } = useShell();
  return STAFF.filter(
    (s) =>
      s.id !== userId &&
      (isOwner ||
        (s.roleKey !== "owner" &&
          s.roleKey !== "sale_admin" &&
          (s.managerId === userId || s.roleKey === "telesale"))),
  );
}

export function CrmTargets() {
  const { state, act } = useCrm();
  const { can, me } = useShell();
  const people = useManaged().filter((s) => KPIS.some((k) => k.staffId === s.id));
  const edit = can("target.manage");
  return (
    <>
      <h1 className="sr-only">Đội ngũ: chỉ tiêu</h1>
      <Card title="Chỉ tiêu tháng 10" note="Tính theo tỷ lệ ngày làm thực tế khi có ngày nghỉ">
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Người</th>
                <th className="text-right">Doanh thu cọc đạt</th>
                <th>Chỉ tiêu doanh thu cọc</th>
                <th className="text-right">Cuộc gọi mỗi ngày</th>
                <th>Chỉ tiêu cuộc gọi</th>
                <th className="text-right">Ngày nghỉ</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const k = KPIS.find((x) => x.staffId === p.id)!;
                const t = state.targets[p.id] ?? { revenue: k.revenueTarget, calls: k.callsTarget };
                const off = state.absences.filter((a) => a.staffId === p.id).length;
                // Chỉ tiêu theo tỷ lệ ngày làm: tháng 26 ngày làm việc.
                const prorated = Math.round((t.revenue * (26 - off)) / 26);
                return (
                  <tr key={p.id}>
                    <td>
                      <b>{p.fullName}</b> <span className="c-lbl">{p.title}</span>
                    </td>
                    <td className="text-right tabular">{vnd(k.revenueDeposit)}</td>
                    <td>
                      {edit ? (
                        <TargetInput
                          label={`Chỉ tiêu doanh thu ${p.fullName}`}
                          value={t.revenue}
                          onSave={(v) =>
                            act(
                              { type: "setTarget", staffId: p.id, revenue: v, calls: t.calls, actor: me },
                              `Đã đặt chỉ tiêu cho ${p.fullName}`,
                            )
                          }
                        />
                      ) : (
                        <span className="tabular">{vnd(t.revenue)}</span>
                      )}
                      {off ? (
                        <span className="c-lbl block">Sau khi trừ ngày nghỉ: {vnd(prorated)}</span>
                      ) : null}
                    </td>
                    <td className="text-right tabular">{k.callsPerDay}</td>
                    <td>
                      {edit ? (
                        <TargetInput
                          label={`Chỉ tiêu cuộc gọi ${p.fullName}`}
                          value={t.calls}
                          onSave={(v) =>
                            act(
                              { type: "setTarget", staffId: p.id, revenue: t.revenue, calls: v, actor: me },
                              `Đã đặt chỉ tiêu cho ${p.fullName}`,
                            )
                          }
                        />
                      ) : (
                        <span className="tabular">{t.calls}</span>
                      )}
                    </td>
                    <td className="text-right tabular">{off}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!edit ? <p className="c-lbl mt-2 mb-0">Chỉ người có quyền đặt chỉ tiêu mới sửa được.</p> : null}
      </Card>
    </>
  );
}

function TargetInput({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number;
  onSave: (v: number) => void;
}) {
  const [v, setV] = useState(String(value));
  return (
    <form
      className="flex gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Math.round(Number(v.replace(/[^\d]/g, "")));
        if (n > 0) onSave(n);
      }}
    >
      <input
        aria-label={label}
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value)}
        className={`${field} w-32 tabular`}
      />
      <button type="submit" className="c-btn">
        Lưu
      </button>
    </form>
  );
}

export function CrmAbsences() {
  const { state, act } = useCrm();
  const { can, me } = useShell();
  const people = useManaged();
  const [staffId, setStaffId] = useState(people[0]?.id ?? "");
  const [date, setDate] = useState("2026-10-04");
  const [kind, setKind] = useState<"Nghỉ phép" | "Nghỉ ốm" | "Công tác">("Nghỉ phép");
  return (
    <>
      <h1 className="sr-only">Đội ngũ: nghỉ và trực</h1>
      <div className="c-stack">
        <Card title="Nghỉ phép, nghỉ ốm, công tác" note="Ngày nghỉ thì không phân lead">
          {can("staff.manage") ? (
            <form
              className="flex flex-wrap items-end gap-2"
              aria-label="Thêm ngày nghỉ"
              onSubmit={(e) => {
                e.preventDefault();
                act(
                  { type: "addAbsence", staffId, date, kind, actor: me },
                  `Đã duyệt ${kind.toLowerCase()} cho ${staffShort(staffId)}`,
                );
              }}
            >
              <label className="c-lbl">
                Người
                <select
                  aria-label="Người nghỉ"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  className={`${field} block`}
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="c-lbl">
                Ngày
                <input
                  aria-label="Ngày nghỉ"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${field} block`}
                />
              </label>
              <label className="c-lbl">
                Loại
                <select
                  aria-label="Loại nghỉ"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                  className={`${field} block`}
                >
                  <option>Nghỉ phép</option>
                  <option>Nghỉ ốm</option>
                  <option>Công tác</option>
                </select>
              </label>
              <button type="submit" className="c-btn is-brand">
                Duyệt nghỉ
              </button>
            </form>
          ) : (
            <p className="c-lbl m-0">Chỉ người có quyền quản lý nhân sự mới duyệt nghỉ.</p>
          )}
          <ul className="mt-3 mb-0 list-none p-0" aria-label="Danh sách ngày nghỉ">
            {state.absences.length === 0 ? (
              <li className="c-lbl">Chưa có ngày nghỉ nào trong tháng.</li>
            ) : null}
            {state.absences.map((a) => (
              <li key={a.id} className="border-t border-line-2 py-1.5 first:border-t-0">
                <b>{staffShort(a.staffId)}</b> · {a.kind} · {dmy(a.date)}{" "}
                <span className="c-lbl">· {a.approvedBy} duyệt</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Đang trực">
          <ul className="m-0 list-none p-0">
            {state.receivers.map((r) => (
              <li key={r.name} className="flex items-center gap-2 py-1">
                <b className="min-w-24">{r.name}</b>
                <span
                  className={`c-pill ${!r.active ? "is-err" : r.absent ? "is-warn" : r.onDuty ? "is-ok" : "is-n"}`}
                >
                  {!r.active ? "Đã khóa" : r.absent ? "Nghỉ hôm nay" : r.onDuty ? "Đang trực" : "Không trực"}
                </span>
              </li>
            ))}
          </ul>
          <p className="c-lbl mt-2 mb-0">
            Trực bật tắt bằng công tắc trên thanh trên cùng; đây là chấm công nhẹ, không dùng tính lương.
          </p>
        </Card>
      </div>
    </>
  );
}

/** Ghi chú kèm cặp người viết, Owner và quản lý được xem; nhân viên chỉ thấy ghi chú được chia sẻ (CLAUDE.md 9.6). */
export function visibleNotes(
  notes: CoachingNote[],
  viewerId: string,
  isOwner: boolean,
  manages: (staffId: string) => boolean,
) {
  return notes.filter(
    (n) => n.authorId === viewerId || isOwner || manages(n.staffId) || (n.staffId === viewerId && n.shared),
  );
}

export function CrmCoaching() {
  const { state, act } = useCrm();
  const { me, userId, isOwner } = useShell();
  const people = useManaged();
  const managed = new Set(people.map((p) => p.id));
  const notes = visibleNotes(state.coaching, userId, isOwner, (id) => managed.has(id)).filter(
    (n) => n.staffId !== userId || n.authorId === userId,
  );
  const [staffId, setStaffId] = useState(people[0]?.id ?? "");
  const [text, setText] = useState("");
  const [goal, setGoal] = useState("");
  return (
    <>
      <h1 className="sr-only">Đội ngũ: kèm cặp</h1>
      <div className="c-stack">
        <Card title="Viết ghi chú kèm cặp">
          <form
            className="space-y-2"
            aria-label="Ghi chú kèm cặp mới"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              act(
                {
                  type: "addCoaching",
                  note: {
                    staffId,
                    authorId: userId,
                    author: me,
                    date: "2026-10-04",
                    text: text.trim(),
                    goal: goal.trim(),
                    shared: false,
                  },
                  actor: me,
                },
                "Đã lưu ghi chú kèm cặp",
              );
              setText("");
              setGoal("");
            }}
          >
            <select
              aria-label="Nhân viên được kèm"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className={field}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
            <textarea
              aria-label="Nội dung kèm cặp"
              placeholder="Quan sát, ví dụ cụ thể"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className={`${field} block h-20 w-full`}
            />
            <input
              aria-label="Mục tiêu cải thiện"
              placeholder="Mục tiêu cải thiện"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className={`${field} block w-full`}
            />
            <button type="submit" className="c-btn is-brand">
              Lưu ghi chú
            </button>
            <p className="c-lbl m-0">Mặc định nhân viên được nhắc không đọc được; bật Chia sẻ để họ đọc.</p>
          </form>
        </Card>
        <Card title="Ghi chú đã viết">
          {notes.length === 0 ? <p className="c-lbl m-0">Chưa có ghi chú nào bạn được xem.</p> : null}
          <ul className="m-0 list-none p-0">
            {notes.map((n) => (
              <li key={n.id} className="border-t border-line-2 py-2 first:border-t-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{staffShort(n.staffId)}</b>
                  <span className="c-lbl">
                    {n.author} · {dmy(n.date)}
                  </span>
                  {n.authorId === userId ? (
                    <label className="ml-auto flex items-center gap-1 c-lbl">
                      <input
                        type="checkbox"
                        checked={n.shared}
                        onChange={(e) =>
                          act(
                            { type: "shareCoaching", id: n.id, shared: e.target.checked, actor: me },
                            e.target.checked ? "Đã chia sẻ với nhân viên" : "Đã thôi chia sẻ",
                          )
                        }
                      />
                      Chia sẻ với nhân viên
                    </label>
                  ) : (
                    <span className="c-pill is-n ml-auto">{n.shared ? "Đã chia sẻ" : "Không chia sẻ"}</span>
                  )}
                </div>
                <p className="my-1">{n.text}</p>
                {n.goal ? <p className="c-lbl m-0">Mục tiêu: {n.goal}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

/** Ghi chú được chia sẻ với chính người xem, hiện trên trang Hiệu suất của tôi. */
export function SharedCoaching({ staffId }: { staffId: string }) {
  const { state } = useCrm();
  const { userId } = useShell();
  if (staffId !== userId) return null;
  const notes = state.coaching.filter((n) => n.staffId === userId && n.shared);
  if (!notes.length) return null;
  return (
    <section className="c-card" aria-label="Góp ý từ quản lý">
      <div className="c-ch">
        <h2>Góp ý từ quản lý</h2>
      </div>
      <ul className="m-0 list-none px-4 pb-3">
        {notes.map((n) => (
          <li key={n.id} className="py-1">
            {n.text} <span className="c-lbl">· {n.author}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CrmOffboarding() {
  const { state, act } = useCrm();
  const { me } = useShell();
  const candidates = STAFF.filter((s) => s.roleKey !== "owner");
  const [staffId, setStaffId] = useState(candidates.find((s) => s.roleKey === "telesale")?.id ?? "");
  const [to, setTo] = useState<string[]>([]);
  const name = staffShort(staffId);
  const locked = state.offboarded.includes(staffId);
  const pendingOpps = state.opps.filter(
    (o) => !o.owner && state.activities.some((x) => x.oppId === o.id && x.text.includes(`Bàn giao: ${name}`)),
  );
  const pendingTasks = state.tasks.filter(
    (t) => t.owner === "" && t.outcome === "Bàn giao" && t.status === "open",
  );
  const openOrders = state.orders.filter(
    (o) => o.sellerId === staffId && !["completed", "cancelled"].includes(o.status),
  );
  const receivers = state.receivers.filter((r) => r.active && r.name !== name).map((r) => r.name);
  const transferred = locked && pendingOpps.length === 0 && pendingTasks.length === 0;

  function report() {
    const lines = [
      `BIÊN BẢN BÀN GIAO DO NGHỈ VIỆC`,
      `Người nghỉ: ${STAFF.find((s) => s.id === staffId)?.fullName}`,
      `Người nhận: ${to.join(", ") || "chưa chọn"}`,
      `Người lập: ${me}, ngày 04/10/2026`,
      ``,
      ...state.activities
        .filter((x) => x.text.startsWith(`Bàn giao do nghỉ việc: ${name}`))
        .map((x) => `- ${state.opps.find((o) => o.id === x.oppId)?.name}: ${x.text}`),
      ...openOrders.map((o) => `- Đơn ${o.code}: giữ người bán cũ để báo cáo, người nhận theo dõi tiếp`),
    ];
    const a = document.createElement("a");
    a.href = `data:text/plain;charset=utf-8,${encodeURIComponent(lines.join("\n"))}`;
    a.download = `bien-ban-ban-giao-${name}.txt`;
    a.click();
  }

  return (
    <>
      <h1 className="sr-only">Đội ngũ: bàn giao</h1>
      <Card title="Bàn giao khi nghỉ việc" note="Chỉ Owner thực hiện">
        <ol className="m-0 space-y-3 pl-5">
          <li>
            <b>Khóa tài khoản, thu hồi phiên.</b> Lead và việc đang mở về hàng chung ngay, nên bỏ dở trình này
            cũng không để việc kẹt.
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <select
                aria-label="Người nghỉ việc"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className={field}
                disabled={locked}
              >
                {candidates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} · {s.title}
                  </option>
                ))}
              </select>
              {locked ? (
                <span className="c-pill is-err">Đã khóa</span>
              ) : (
                <button
                  type="button"
                  className="c-btn"
                  style={{ color: "var(--err)" }}
                  onClick={() =>
                    act(
                      { type: "offboardLock", staffId, actor: me },
                      `Đã khóa ${name}, lead và việc về hàng chung`,
                    )
                  }
                >
                  Khóa {name}
                </button>
              )}
            </div>
          </li>
          <li>
            <b>Việc đang mở cần bàn giao</b>
            <p className="c-lbl my-1">
              {pendingOpps.length} lead, {pendingTasks.length} việc, {openOrders.length} đơn chưa hoàn tất
            </p>
            {locked ? (
              <ul className="m-0 list-disc pl-5">
                {pendingOpps.map((o) => (
                  <li key={o.id}>{o.name}</li>
                ))}
                {openOrders.map((o) => (
                  <li key={o.id}>Đơn {o.code}</li>
                ))}
              </ul>
            ) : null}
          </li>
          <li>
            <b>Chọn người nhận</b> (một người, hoặc nhiều người để chia vòng tròn)
            <div className="mt-1 flex flex-wrap gap-1.5">
              {receivers.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={to.includes(r)}
                  className={`c-btn ${to.includes(r) ? "is-brand" : ""}`}
                  onClick={() => setTo((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))}
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                className="c-btn is-brand"
                disabled={!locked || !to.length || (pendingOpps.length === 0 && pendingTasks.length === 0)}
                onClick={() =>
                  act(
                    { type: "offboardTransfer", staffId, to, actor: me },
                    `Đã chuyển ${pendingOpps.length} lead, ${pendingTasks.length} việc`,
                  )
                }
              >
                Chuyển hàng loạt
              </button>
            </div>
          </li>
          <li>
            <b>Xuất biên bản bàn giao.</b> Lịch sử và chỉ số của người đã nghỉ vẫn giữ để báo cáo.
            <div className="mt-1">
              <button type="button" className="c-btn" disabled={!transferred} onClick={report}>
                Xuất biên bản
              </button>
              {transferred ? <span className="c-pill is-ok ml-2">Đã bàn giao xong</span> : null}
            </div>
          </li>
        </ol>
      </Card>
    </>
  );
}
