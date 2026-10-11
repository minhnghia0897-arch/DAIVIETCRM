"use client";

import { Copy, Phone } from "lucide-react";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/switch";
import { PROVINCES_ALL } from "@/lib/demo/sales-catalog";
import { LEAD_STAGE_LABEL } from "@/lib/leads/labels";
import { LocTag, Steps } from "../parts";
import { useShell } from "../shell-context";

// Hồ sơ lead bản thật (route /leads/[id]): dữ liệu do server page đọc từ database, mọi thao tác gọi server action.
// Bố cục bám bản mô phỏng lead-profile.tsx; phần báo giá, hộ, AI chưa có dữ liệu thật nên chưa hiện.

type Result = { ok: boolean; message: string };

export interface LiveLeadData {
  id: string;
  stage: string;
  sourceLabel: string;
  lostLabel: string | null;
  ownerName: string | null;
  mine: boolean;
  sla: { tone: "n" | "warn" | "err"; text: string } | null;
  buyer: {
    id: string;
    name: string;
    country: string;
    city: string | null;
    phoneMasked: string | null;
    phoneIdentityId: string | null;
    phoneInvalid: boolean;
  };
  buyFor: "self" | "other" | null;
  recipient: { id: string; name: string; relation: string | null; phoneMasked: string | null } | null;
  recipientProvince: string | null;
  occasionId: string | null;
  occasionDate: string | null;
  budgetRangeId: string | null;
  keepSurprise: boolean;
  catalogs: {
    occasions: { id: string; label: string }[];
    budgets: { id: string; label: string }[];
    outcomes: { key: string; label: string }[];
    lostReasons: { key: string; label: string }[];
    markets: { code: string; name: string }[];
  };
  callbackSlots: { at: string; label: string }[];
  tasks: { id: string; label: string; due: string; overdue: boolean }[];
  dates: { id: string; label: string; date: string; who: string }[];
  activity: { id: string; kind: string; text: string; actor: string; time: string; file?: string }[];
}

export interface LiveLeadActions {
  revealPhone(i: {
    leadId: string;
    identityId: string;
  }): Promise<{ ok: true; phone: string } | { ok: false; message: string }>;
  logCall(i: {
    leadId: string;
    channel: "phone" | "zalo";
    outcomeKey: string;
    note?: string;
    callbackAt?: string;
  }): Promise<Result>;
  addNote(i: { leadId: string; text: string }): Promise<Result>;
  updateLeadInfo(i: {
    leadId: string;
    recipientProvince?: string | null;
    occasionId?: string | null;
    occasionDate?: string | null;
    budgetRangeId?: string | null;
    keepSurprise?: boolean;
  }): Promise<Result>;
  setBuyerMarket(i: { leadId: string; contactId: string; country: string }): Promise<Result>;
  setRecipient(i: { leadId: string; self: boolean; name?: string; relation?: string }): Promise<Result>;
  moveToDemo(i: { leadId: string }): Promise<Result>;
  markLost(i: { leadId: string; reasonKey: string }): Promise<Result>;
  addImportantDate(i: { leadId: string; contactId: string; label: string; date: string }): Promise<Result>;
}

const STAGE_ORDER = ["new", "contacted", "demo", "quoted", "deposit", "won"];
const STAGE_STEPS = STAGE_ORDER.map((s) => LEAD_STAGE_LABEL[s]);
const RELATIONS = ["Bố", "Mẹ", "Bố mẹ", "Vợ", "Chồng", "Con", "Ông bà", "Anh chị em", "Bạn", "Khác"];
const SELECT = "rounded-control border border-line bg-surface px-1.5 py-1";

/** Bốn thông tin telesale phải hỏi ở cuộc gọi đầu (CLAUDE.md mục 6). */
function missingInfo(d: LiveLeadData): string[] {
  const out: string[] = [];
  if (!d.buyFor) out.push("mua cho ai");
  if (!d.recipientProvince) out.push("tỉnh người nhận");
  if (!d.occasionId) out.push("dịp mua");
  if (!d.budgetRangeId) out.push("ngân sách");
  return out;
}

export function LeadLive({ data: d, actions }: { data: LiveLeadData; actions: LiveLeadActions }) {
  const { can } = useShell();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [losing, setLosing] = useState(false);
  const [lostReason, setLostReason] = useState("");

  const closed = d.stage === "won" || d.stage === "lost";
  // Cùng luật với database (assert_lead_editor): sửa mọi lead, hoặc lead mình đang giữ.
  const canEdit = !closed && (can("lead.edit_all") || (can("lead.edit_own") && d.mine));
  const canReveal = can("contact.phone_reveal") || (can("contact.phone_reveal_assigned") && d.mine);
  const missing = missingInfo(d);
  const stageIdx = STAGE_ORDER.indexOf(d.stage);

  function run(fn: () => Promise<Result>, after?: () => void) {
    start(async () => {
      try {
        const r = await fn();
        toast(r.message, r.ok ? "ok" : "err");
        if (r.ok) after?.();
      } catch {
        toast("Chưa lưu được, thử lại sau ít phút.", "err");
      }
    });
  }

  function call() {
    if (!d.buyer.phoneIdentityId) return;
    start(async () => {
      const r = await actions.revealPhone({ leadId: d.id, identityId: d.buyer.phoneIdentityId! });
      if (r.ok) {
        setRevealed(r.phone);
        setLogging(true);
      } else toast(r.message, "err");
    });
  }

  const loc = d.buyer.country === "KR" || d.buyer.country === "VN" ? d.buyer.country : null;

  return (
    <div className="c-stack c-flat">
      <section className="c-card" aria-label={`Hồ sơ lead ${d.buyer.name}`} aria-busy={pending}>
        <div className="c-ch">
          <h1 className="m-0 text-[17px]">{d.buyer.name}</h1>
          {loc ? (
            <LocTag loc={loc} city={d.buyer.city ?? undefined} />
          ) : (
            <span className="c-pill is-warn">Chưa rõ thị trường</span>
          )}
          <span className="c-r">
            <span className="c-lbl">Phụ trách {d.ownerName ?? "chưa phân"}</span>
            {d.sla ? <span className={`c-pill is-${d.sla.tone}`}>{d.sla.text}</span> : null}
            <span className={`c-pill ${d.stage === "lost" ? "is-err" : "is-n"}`}>
              {LEAD_STAGE_LABEL[d.stage] ?? d.stage}
            </span>
          </span>
        </div>
        <div className="c-cb">
          {d.stage === "lost" ? (
            <p className="mt-0 mb-2 rounded-control bg-err-soft px-2.5 py-2 text-err" role="note">
              <b>Thất bại:</b> {d.lostLabel ?? "không rõ lý do"}.
            </p>
          ) : (
            <Steps labels={STAGE_STEPS} current={Math.max(stageIdx, 0)} />
          )}

          {!closed && missing.length ? (
            <p className="mt-0 mb-2 rounded-control bg-warn-soft px-2.5 py-2 text-warn" role="note">
              <b>Thiếu thông tin bắt buộc:</b> {missing.join(", ")}. Chưa chuyển sang Demo và chưa tạo báo giá
              được.
            </p>
          ) : null}
          {d.keepSurprise ? (
            <p className="mt-0 mb-2 rounded-control bg-ai-soft px-2.5 py-2 text-ai" role="note">
              <b>Giữ bất ngờ:</b> không gọi, không nhắn, không hiện số người nhận cho tới khi người đặt cho
              phép.
            </p>
          ) : null}
          {d.buyer.phoneInvalid ? (
            <p className="mt-0 mb-2 rounded-control bg-warn-soft px-2.5 py-2 text-warn" role="note">
              Số người đặt có vẻ sai dạng. Kiểm tra lại với khách qua Zalo hoặc nguồn lead.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {can("call.make") && !closed ? (
              <button
                type="button"
                className="c-btn is-go"
                disabled={pending || !canReveal || !d.buyer.phoneIdentityId}
                title={
                  !d.buyer.phoneIdentityId
                    ? "Khách chưa có số điện thoại"
                    : !canReveal
                      ? "Chỉ người đang giữ lead mới xem được số để gọi"
                      : undefined
                }
                onClick={call}
              >
                <Phone size={13} className="mr-1 inline" aria-hidden />
                Gọi {d.buyer.name.split(" ").pop()}
              </button>
            ) : null}
            {canEdit ? (
              <button type="button" className="c-btn" onClick={() => setLogging((v) => !v)}>
                Ghi kết quả cuộc gọi
              </button>
            ) : null}
            {canEdit && (d.stage === "new" || d.stage === "contacted") ? (
              <button
                type="button"
                className="c-btn"
                disabled={pending || missing.length > 0}
                title={missing.length ? `Thiếu: ${missing.join(", ")}` : undefined}
                onClick={() => run(() => actions.moveToDemo({ leadId: d.id }))}
              >
                Chuyển sang Demo
              </button>
            ) : null}
            <span className="ml-auto" aria-hidden />
            {canEdit && can("lead.mark_lost") ? (
              <button type="button" className="c-btn is-ghost is-danger" onClick={() => setLosing((v) => !v)}>
                Đánh dấu thất bại
              </button>
            ) : null}
          </div>

          {revealed !== null ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-2">
              <b className="tabular text-[15px]">{revealed}</b>
              <a className="c-btn" href={`tel:${revealed.replace(/\s/g, "")}`}>
                Mở trình gọi
              </a>
              <button
                type="button"
                className="c-ib"
                aria-label="Sao chép số"
                onClick={() => navigator.clipboard?.writeText(revealed).catch(() => undefined)}
              >
                <Copy size={15} />
              </button>
              <span className="c-lbl">Lượt xem số được ghi lại.</span>
              <button type="button" className="c-link ml-auto text-label" onClick={() => setRevealed(null)}>
                Ẩn số
              </button>
            </div>
          ) : null}

          {logging && canEdit ? (
            <CallLogForm
              d={d}
              pending={pending}
              onCancel={() => setLogging(false)}
              onSubmit={(v) =>
                run(
                  () => actions.logCall({ leadId: d.id, ...v }),
                  () => {
                    setLogging(false);
                    setRevealed(null);
                  },
                )
              }
            />
          ) : null}

          {losing ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-control bg-err-soft p-2.5">
              <label htmlFor="lost-reason" className="font-semibold text-err">
                Lý do thất bại
              </label>
              <select
                id="lost-reason"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                className={SELECT}
              >
                <option value="">Chọn lý do…</option>
                {d.catalogs.lostReasons.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="c-btn"
                style={{ color: "var(--err)" }}
                disabled={!lostReason || pending}
                onClick={() =>
                  run(
                    () => actions.markLost({ leadId: d.id, reasonKey: lostReason }),
                    () => setLosing(false),
                  )
                }
              >
                Xác nhận thất bại
              </button>
            </div>
          ) : null}

          <div className="c-rgrid mt-3">
            <InfoTable d={d} canEdit={canEdit} pending={pending} run={run} actions={actions} />

            <div className="min-w-0 space-y-3">
              <p className="c-lbl m-0">Nguồn: {d.sourceLabel}</p>
              <div>
                <b>Việc đang mở</b>
                {d.tasks.length ? (
                  <ul className="mt-1 mb-0 list-none space-y-1 p-0" aria-label="Việc đang mở">
                    {d.tasks.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center gap-1.5">
                        <span className={`c-pill ${t.overdue ? "is-err" : "is-n"}`}>{t.due}</span>
                        <span className="min-w-0 flex-1">{t.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="c-lbl m-0">Không có việc đang mở. Hẹn gọi lại sẽ hiện ở đây.</p>
                )}
              </div>
              <ImportantDates d={d} canEdit={canEdit} pending={pending} run={run} actions={actions} />
            </div>
          </div>

          <h2 className="mt-4 mb-2 text-[15px]">Hoạt động ({d.activity.length})</h2>
          <ActivityList d={d} canEdit={canEdit} pending={pending} run={run} actions={actions} />
        </div>
      </section>
    </div>
  );
}

type PartProps = {
  d: LiveLeadData;
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
  actions: LiveLeadActions;
};

function InfoTable({ d, canEdit, pending, run, actions }: PartProps) {
  const [buyFor, setBuyFor] = useState(d.buyFor);
  const [relation, setRelation] = useState(d.recipient?.relation ?? "");
  const [rname, setRname] = useState(d.recipient?.name ?? "");
  const save = (patch: Omit<Parameters<LiveLeadActions["updateLeadInfo"]>[0], "leadId">) =>
    run(() => actions.updateLeadInfo({ leadId: d.id, ...patch }));

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" disabled={!canEdit || pending}>
      <legend className="mb-1 font-bold">Người đặt và người nhận</legend>
      <table className="c-rl">
        <tbody>
          <tr>
            <td>Số người đặt</td>
            <td className="tabular">{d.buyer.phoneMasked ?? "Chưa có"}</td>
          </tr>
          <tr>
            <td>
              <label htmlFor="li-market">Thị trường người đặt</label>
            </td>
            <td>
              <select
                id="li-market"
                value={d.buyer.country}
                onChange={(e) =>
                  run(() =>
                    actions.setBuyerMarket({ leadId: d.id, contactId: d.buyer.id, country: e.target.value }),
                  )
                }
                className={SELECT}
              >
                <option value="unknown">Chưa rõ</option>
                {d.catalogs.markets.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr>
            <td>Mua cho ai</td>
            <td>
              <span className="inline-flex gap-3">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="buyfor"
                    checked={buyFor === "self"}
                    onChange={() => {
                      setBuyFor("self");
                      run(() => actions.setRecipient({ leadId: d.id, self: true }));
                    }}
                  />
                  Chính mình
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="buyfor"
                    checked={buyFor === "other"}
                    onChange={() => setBuyFor("other")}
                  />
                  Tặng người khác
                </label>
              </span>
            </td>
          </tr>
          {buyFor === "other" ? (
            <>
              <tr>
                <td>
                  <label htmlFor="li-rname">Tên người nhận</label>
                </td>
                <td>
                  <input
                    id="li-rname"
                    value={rname}
                    onChange={(e) => setRname(e.target.value)}
                    className="w-40 rounded-control border border-line bg-surface px-1.5 py-1 text-right"
                  />
                </td>
              </tr>
              <tr>
                <td>
                  <label htmlFor="li-rel">Quan hệ người nhận</label>
                </td>
                <td>
                  <select
                    id="li-rel"
                    value={relation}
                    onChange={(e) => setRelation(e.target.value)}
                    className={SELECT}
                  >
                    <option value="">Chọn…</option>
                    {RELATIONS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </td>
              </tr>
              {canEdit &&
              (rname.trim() !== (d.recipient?.name ?? "") || relation !== (d.recipient?.relation ?? "")) ? (
                <tr>
                  <td />
                  <td>
                    <button
                      type="button"
                      className="c-btn"
                      disabled={!rname.trim()}
                      onClick={() =>
                        run(() =>
                          actions.setRecipient({
                            leadId: d.id,
                            self: false,
                            name: rname.trim(),
                            relation: relation || undefined,
                          }),
                        )
                      }
                    >
                      Lưu người nhận
                    </button>
                  </td>
                </tr>
              ) : null}
              <tr>
                <td>Số người nhận</td>
                <td className="tabular">
                  {d.keepSurprise ? (
                    <span className="c-pill is-ai">Ẩn vì Giữ bất ngờ</span>
                  ) : (
                    (d.recipient?.phoneMasked ?? "Chưa có")
                  )}
                </td>
              </tr>
            </>
          ) : null}
          <tr>
            <td>
              <label htmlFor="li-prov">Tỉnh người nhận</label>
            </td>
            <td>
              <select
                id="li-prov"
                value={d.recipientProvince ?? ""}
                onChange={(e) => save({ recipientProvince: e.target.value || null })}
                className={SELECT}
              >
                <option value="">Chọn…</option>
                {PROVINCES_ALL.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </td>
          </tr>
          <tr>
            <td>
              <label htmlFor="li-occ">Dịp mua</label>
            </td>
            <td>
              <select
                id="li-occ"
                value={d.occasionId ?? ""}
                onChange={(e) => save({ occasionId: e.target.value || null })}
                className={`max-w-48 ${SELECT}`}
              >
                <option value="">Chọn…</option>
                {d.catalogs.occasions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          <tr>
            <td>
              <label htmlFor="li-occ-date">Ngày của dịp</label>
            </td>
            <td>
              <input
                id="li-occ-date"
                type="date"
                defaultValue={d.occasionDate ?? ""}
                onBlur={(e) =>
                  e.target.value !== (d.occasionDate ?? "") && save({ occasionDate: e.target.value || null })
                }
                className={SELECT}
              />
            </td>
          </tr>
          <tr>
            <td>
              <label htmlFor="li-budget">Ngân sách</label>
            </td>
            <td>
              <select
                id="li-budget"
                value={d.budgetRangeId ?? ""}
                onChange={(e) => save({ budgetRangeId: e.target.value || null })}
                className={SELECT}
              >
                <option value="">Chọn…</option>
                {d.catalogs.budgets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          {buyFor === "other" ? (
            <tr>
              <td>Giữ bất ngờ</td>
              <td>
                <Switch
                  label="Giữ bất ngờ"
                  checked={d.keepSurprise}
                  disabled={!canEdit || pending}
                  onCheckedChange={(v) => save({ keepSurprise: v })}
                />
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </fieldset>
  );
}

function CallLogForm({
  d,
  pending,
  onCancel,
  onSubmit,
}: {
  d: LiveLeadData;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (v: {
    channel: "phone" | "zalo";
    outcomeKey: string;
    note?: string;
    callbackAt?: string;
  }) => void;
}) {
  const [channel, setChannel] = useState<"phone" | "zalo">("phone");
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [callback, setCallback] = useState<string | null>(null);

  return (
    <form
      className="c-nba"
      aria-label="Ghi kết quả cuộc gọi"
      onSubmit={(e) => {
        e.preventDefault();
        if (!outcome) return;
        onSubmit({
          channel,
          outcomeKey: outcome,
          note: note.trim() || undefined,
          callbackAt: callback ?? undefined,
        });
      }}
    >
      <h3>Ghi kết quả cuộc gọi</h3>
      <div className="flex flex-wrap items-center gap-3">
        <span className="c-lbl">Đã gọi qua</span>
        {(
          [
            ["phone", "Điện thoại"],
            ["zalo", "Zalo"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="inline-flex items-center gap-1">
            <input type="radio" name="call-channel" checked={channel === k} onChange={() => setChannel(k)} />
            {label}
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kết quả">
        {d.catalogs.outcomes.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={outcome === o.key}
            className={`c-btn ${outcome === o.key ? "is-brand" : ""}`}
            onClick={() => setOutcome(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <input
        aria-label="Ghi chú cuộc gọi"
        placeholder="Ghi chú ngắn: người nhận, dịp, lo ngại…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mt-2 w-full rounded-control border border-line bg-surface px-2 py-1.5"
      />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="c-lbl">Hẹn gọi lại (giờ của khách):</span>
        {d.callbackSlots.map((s) => (
          <button
            key={s.at}
            type="button"
            aria-pressed={callback === s.at}
            className={`c-btn ${callback === s.at ? "is-brand" : ""}`}
            onClick={() => setCallback(callback === s.at ? null : s.at)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-1.5">
        <button type="submit" className="c-btn is-brand" disabled={!outcome || pending}>
          Lưu kết quả
        </button>
        <button type="button" className="c-btn" onClick={onCancel}>
          Hủy
        </button>
      </div>
    </form>
  );
}

function ImportantDates({ d, canEdit, pending, run, actions }: PartProps) {
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  // Ngày quan trọng gắn vào người nhận khi mua tặng, vào người đặt khi mua cho mình.
  const contactId = d.recipient?.id ?? d.buyer.id;
  return (
    <div>
      <b>Ngày quan trọng</b>
      {d.dates.length ? (
        <ul className="mt-1 mb-1 list-disc pl-5">
          {d.dates.map((x) => (
            <li key={x.id}>
              {x.label}: <b>{x.date}</b>
              {x.who ? <span className="c-lbl"> · {x.who}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="c-lbl mt-0 mb-1">
          Chưa ghi ngày nào. Nghe được sinh nhật, mừng thọ trong cuộc gọi thì ghi ở đây.
        </p>
      )}
      {canEdit ? (
        <form
          className="flex flex-wrap gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim() || !date) return;
            run(
              () => actions.addImportantDate({ leadId: d.id, contactId, label: label.trim(), date }),
              () => {
                setLabel("");
                setDate("");
              },
            );
          }}
        >
          <input
            aria-label="Tên ngày quan trọng"
            placeholder="Sinh nhật mẹ"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1"
          />
          <input
            aria-label="Ngày"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-control border border-line bg-surface px-2 py-1"
          />
          <button type="submit" className="c-btn" disabled={pending}>
            Thêm
          </button>
        </form>
      ) : null}
    </div>
  );
}

function ActivityList({ d, canEdit, pending, run, actions }: PartProps) {
  const [note, setNote] = useState("");
  return (
    <div>
      {canEdit ? (
        <form
          className="mb-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            run(
              () => actions.addNote({ leadId: d.id, text: note.trim() }),
              () => setNote(""),
            );
          }}
        >
          <input
            aria-label="Ghi chú"
            placeholder="Thêm ghi chú…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1.5"
          />
          <button type="submit" className="c-btn" disabled={pending}>
            Lưu
          </button>
        </form>
      ) : null}
      {d.activity.length ? (
        <ul className="m-0 list-none p-0" aria-label="Dòng hoạt động">
          {d.activity.map((a) => (
            <li key={a.id} className="flex gap-2 border-t border-line-2 py-1.5 first:border-t-0">
              <span className="c-pill is-n shrink-0">{a.kind}</span>
              <span className="min-w-0 flex-1">
                {a.text}
                {a.file ? (
                  <>
                    {" "}
                    <a className="c-link" href={a.file} target="_blank" rel="noreferrer">
                      Xem ảnh
                    </a>
                  </>
                ) : null}
              </span>
              <span className="c-lbl shrink-0 tabular">
                {a.actor ? `${a.actor} · ` : ""}
                {a.time}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="c-lbl m-0">Chưa có hoạt động. Cuộc gọi, tin nhắn, ghi chú sẽ hiện ở đây.</p>
      )}
    </div>
  );
}
