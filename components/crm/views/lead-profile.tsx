"use client";

import { Copy, Phone, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import { STAGES, houseById, tr, type Opportunity } from "@/lib/demo/crm-data";
import { TASK_TYPE_LABEL, missingInfo, newLeadInfo, type LeadInfo } from "@/lib/demo/ops-data";
import { PROVINCES_ALL } from "@/lib/demo/sales-catalog";
import { LocTag, Steps } from "../parts";
import { useShell } from "../shell-context";
import { fmtDue, fmtMinutes, useCrm, type Activity, type CrmState } from "../store";
import { AssignSelect, SlaPill } from "./lead-intake";
import { QuoteBuilder, QuoteList } from "./quote-builder";

const RELATIONS = ["Bố", "Mẹ", "Bố mẹ", "Vợ", "Chồng", "Con", "Ông bà", "Anh chị em", "Bạn", "Khác"];

const ACT_LABEL: Record<Activity["kind"], string> = {
  call: "Cuộc gọi",
  zalo: "Zalo",
  note: "Ghi chú",
  stage: "Giai đoạn",
  quote: "Báo giá",
  payment: "Thanh toán",
  task: "Việc",
  info: "Hồ sơ",
  reveal: "Xem số",
  delivery: "Đơn hàng",
};

/** Gợi ý giờ hẹn gọi lại luôn nằm trong khung gọi của thị trường khách (CLAUDE.md mục 7). */
function callbackSlots(state: CrmState, market: string): { at: number; label: string }[] {
  const m = state.settings.markets.find((x) => x.code === market) ?? state.settings.markets[0];
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const off = m.offsetHours * 60;
  const [ws, we] = m.weekday.map(toMin);
  const out: { at: number; label: string }[] = [];
  for (let day = 0; day < 2 && out.length < 3; day++) {
    for (let local = ws; local <= we - 30 && out.length < 3; local += 60) {
      const at = day * 1440 + local - off;
      if (at <= state.minutes + 15) continue;
      out.push({
        at,
        label: m.offsetHours
          ? `${fmtMinutes(local)} giờ ${m.name.replace("Quốc", "").trim()} (${fmtDue(at)} VN)`
          : fmtDue(at),
      });
    }
  }
  return out;
}

export function LeadProfile({ opp }: { opp: Opportunity }) {
  const { state, act } = useCrm();
  const { can, me, ask } = useShell();
  const router = useRouter();
  const info: LeadInfo = state.leadInfo[opp.id] ?? newLeadInfo("VN");
  const missing = missingInfo(info);
  const [tab, setTab] = useState<"activity" | "quotes">("activity");
  const [building, setBuilding] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [losing, setLosing] = useState(false);
  const [lostReason, setLostReason] = useState("");

  const canEdit = can("lead.edit_all") || (can("lead.edit_own") && opp.owner === me);
  const provider = state.settings.callMode === "provider";
  const canReveal = can("contact.phone_reveal") || (can("contact.phone_reveal_assigned") && opp.owner === me);
  const set = (patch: Partial<LeadInfo>) => act({ type: "updateLeadInfo", oppId: opp.id, patch, actor: me });
  const catalog = (k: string) => state.settings.catalogs[k].items.filter((i) => i.active).map((i) => i.label);
  const tasks = state.tasks.filter((t) => t.oppId === opp.id && t.status === "open");
  const acts = state.activities.filter((a) => a.oppId === opp.id);
  const quotes = state.quotes.filter((q) => q.oppId === opp.id);

  function call(who: "buyer" | "recipient") {
    if (provider) {
      act(
        {
          type: "audit",
          actor: me,
          action: "Gọi qua tổng đài",
          entity: `Lead ${opp.name}`,
          detail: "Số không hiện cho người gọi",
        },
        "Đang gọi qua tổng đài (mô phỏng)",
      );
      setRevealed(null);
    } else {
      act({ type: "revealPhone", oppId: opp.id, who, actor: me });
      setRevealed(who === "buyer" ? info.buyerPhone : info.recipientPhone);
    }
    setLogging(true);
  }

  return (
    <section className="c-card" aria-label={`Hồ sơ lead ${opp.name}`}>
      <div className="c-ch">
        <h2>{opp.name}</h2>
        {info.market === "KR" ? <LocTag loc="KR" city={opp.city || undefined} /> : <LocTag loc="VN" />}
        <span className="c-r">
          {can("lead.assign") ? (
            <AssignSelect oppId={opp.id} />
          ) : (
            <span className="c-lbl">Phụ trách {opp.owner || "chưa phân"}</span>
          )}
          <SlaPill oppId={opp.id} />
          <span className="c-pill is-n">{STAGES[opp.stage]}</span>
        </span>
      </div>
      <div className="c-cb">
        <Steps labels={STAGES} current={opp.stage} />

        {missing.length ? (
          <p className="mt-0 mb-2 rounded-control bg-warn-soft px-2.5 py-2 text-warn" role="note">
            <b>Thiếu thông tin bắt buộc:</b> {missing.join(", ")}. Chưa chuyển sang Demo và chưa tạo báo giá
            được.
          </p>
        ) : null}
        {info.keepSurprise ? (
          <p className="mt-0 mb-2 rounded-control bg-ai-soft px-2.5 py-2 text-ai" role="note">
            <b>Giữ bất ngờ:</b> không gọi, không nhắn, không hiện số người nhận cho tới khi người đặt cho
            phép.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {can("call.make") ? (
            <button
              type="button"
              className="c-btn is-brand"
              disabled={!provider && !canReveal}
              title={!provider && !canReveal ? "Chỉ người đang giữ lead mới xem được số để gọi" : undefined}
              onClick={() => call("buyer")}
            >
              <Phone size={13} className="mr-1 inline" aria-hidden />
              Gọi {opp.name.split(" ").pop()}
            </button>
          ) : null}
          {canEdit ? (
            <button type="button" className="c-btn" onClick={() => setLogging((v) => !v)}>
              Ghi kết quả cuộc gọi
            </button>
          ) : null}
          {opp.stage < 2 && canEdit ? (
            <button
              type="button"
              className="c-btn"
              disabled={opp.stage === 1 && missing.length > 0}
              title={opp.stage === 1 && missing.length ? `Thiếu: ${missing.join(", ")}` : undefined}
              onClick={() =>
                act({ type: "advanceOpp", actor: me }, `Đã chuyển sang ${STAGES[opp.stage + 1]}`)
              }
            >
              Chuyển sang {STAGES[opp.stage + 1]}
            </button>
          ) : null}
          {opp.stage >= 1 && opp.stage < 4 && canEdit && can("quote.create") ? (
            <button
              type="button"
              className="c-btn"
              disabled={missing.length > 0}
              title={missing.length ? `Thiếu: ${missing.join(", ")}` : undefined}
              onClick={() => {
                setTab("quotes");
                setBuilding(true);
              }}
            >
              Tạo báo giá
            </button>
          ) : null}
          {opp.houseId ? (
            <button
              type="button"
              className="c-btn"
              onClick={() => {
                act({ type: "selectHouse", id: opp.houseId! });
                router.push("/households");
              }}
            >
              Mở hồ sơ {houseById(opp.houseId)?.name}
            </button>
          ) : null}
          <button type="button" className="c-btn" onClick={() => ask("Gợi ý bước tiếp cho cơ hội đang chọn")}>
            <Sparkles size={13} className="mr-1 inline" aria-hidden />
            Hỏi AI
          </button>
          {opp.stage < 4 && can("lead.mark_lost") && canEdit ? (
            <button type="button" className="c-btn" onClick={() => setLosing((v) => !v)}>
              Đánh dấu thất bại
            </button>
          ) : null}
        </div>

        {revealed !== null ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-2">
            <b className="tabular text-[15px]">{revealed || "Chưa có số"}</b>
            {revealed ? (
              <>
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
              </>
            ) : null}
            <span className="c-lbl">Lượt xem số được ghi lại.</span>
            <button type="button" className="c-link ml-auto text-label" onClick={() => setRevealed(null)}>
              Ẩn số
            </button>
          </div>
        ) : null}

        {logging ? (
          <CallLogForm
            opp={opp}
            market={info.market}
            provider={provider}
            onDone={() => {
              setLogging(false);
              setRevealed(null);
            }}
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
              className="rounded-control border border-line bg-surface px-2 py-1"
            >
              <option value="">Chọn lý do…</option>
              {catalog("lost").map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <button
              type="button"
              className="c-btn"
              style={{ color: "var(--err)" }}
              disabled={!lostReason}
              onClick={() => {
                setLosing(false);
                act(
                  { type: "loseOpp", reason: lostReason, actor: me },
                  `Đã đánh thất bại: ${lostReason}. Việc đã lên lịch được hủy kèm lý do`,
                );
              }}
            >
              Xác nhận thất bại
            </button>
          </div>
        ) : null}

        <div className="c-rgrid mt-3">
          <fieldset className="m-0 min-w-0 border-0 p-0" disabled={!canEdit}>
            <legend className="mb-1 font-bold">Người đặt và người nhận</legend>
            <table className="c-rl">
              <tbody>
                <tr>
                  <td>Số người đặt</td>
                  <td className="tabular">{info.buyerPhoneMasked}</td>
                </tr>
                <tr>
                  <td>
                    <label htmlFor="li-market">Thị trường người đặt</label>
                  </td>
                  <td>
                    <select
                      id="li-market"
                      value={info.market}
                      onChange={(e) => set({ market: e.target.value as LeadInfo["market"] })}
                      className="rounded-control border border-line bg-surface px-1.5 py-1"
                    >
                      {state.settings.markets
                        .filter((m) => m.active)
                        .map((m) => (
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
                          name={`buyfor-${opp.id}`}
                          checked={info.buyFor === "self"}
                          onChange={() => set({ buyFor: "self" })}
                        />
                        Chính mình
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="radio"
                          name={`buyfor-${opp.id}`}
                          checked={info.buyFor === "other"}
                          onChange={() => set({ buyFor: "other" })}
                        />
                        Tặng người khác
                      </label>
                    </span>
                  </td>
                </tr>
                {info.buyFor === "other" ? (
                  <>
                    <tr>
                      <td>
                        <label htmlFor="li-rel">Quan hệ người nhận</label>
                      </td>
                      <td>
                        <select
                          id="li-rel"
                          value={info.recipientRelation}
                          onChange={(e) => set({ recipientRelation: e.target.value })}
                          className="rounded-control border border-line bg-surface px-1.5 py-1"
                        >
                          <option value="">Chọn…</option>
                          {RELATIONS.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <label htmlFor="li-rname">Tên người nhận</label>
                      </td>
                      <td>
                        <input
                          id="li-rname"
                          defaultValue={info.recipientName}
                          onBlur={(e) => set({ recipientName: e.target.value.trim() })}
                          className="w-40 rounded-control border border-line bg-surface px-1.5 py-1 text-right"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td>Số người nhận</td>
                      <td className="tabular">
                        {info.keepSurprise ? (
                          <span className="c-pill is-ai">Ẩn vì Giữ bất ngờ</span>
                        ) : (
                          info.recipientPhoneMasked || "Chưa có"
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
                      value={info.recipientProvince}
                      onChange={(e) => set({ recipientProvince: e.target.value })}
                      className="rounded-control border border-line bg-surface px-1.5 py-1"
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
                      value={info.occasion}
                      onChange={(e) => set({ occasion: e.target.value })}
                      className="max-w-48 rounded-control border border-line bg-surface px-1.5 py-1"
                    >
                      <option value="">Chọn…</option>
                      {catalog("occasions").map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </td>
                </tr>
                <tr>
                  <td>
                    <label htmlFor="li-budget">Ngân sách</label>
                  </td>
                  <td>
                    <select
                      id="li-budget"
                      value={info.budget}
                      onChange={(e) => set({ budget: e.target.value })}
                      className="rounded-control border border-line bg-surface px-1.5 py-1"
                    >
                      <option value="">Chọn…</option>
                      {catalog("budgets").map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </td>
                </tr>
                {info.buyFor === "other" ? (
                  <tr>
                    <td>Giữ bất ngờ</td>
                    <td>
                      <Switch
                        label="Giữ bất ngờ"
                        checked={info.keepSurprise}
                        disabled={!canEdit}
                        onCheckedChange={(v) => set({ keepSurprise: v })}
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </fieldset>

          <div className="min-w-0 space-y-3">
            <div>
              <div className="c-box-ai" style={{ marginTop: 0 }}>
                <b>AI gợi ý bước tiếp:</b> {opp.next}
              </div>
              <p className="c-lbl mt-1 mb-0">
                {opp.product} · {tr(opp.value)} · nguồn {opp.source} · điểm {opp.score}
              </p>
            </div>
            <div>
              <b>Việc đang mở</b>
              {tasks.length ? (
                <ul className="mt-1 mb-0 list-none space-y-1 p-0">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-1.5">
                      <span className={`c-pill ${t.due < state.minutes ? "is-err" : "is-n"}`}>
                        {fmtDue(t.due)}
                      </span>
                      <span className="min-w-0 flex-1">
                        {TASK_TYPE_LABEL[t.type]}: {t.title}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="c-lbl m-0">Không có việc đang mở.</p>
              )}
            </div>
            <ImportantDates opp={opp} info={info} canEdit={canEdit} />
          </div>
        </div>

        <div className="mt-4 flex gap-1 border-b border-line-2" role="tablist">
          {(
            [
              ["activity", `Hoạt động (${acts.length})`],
              ["quotes", `Báo giá (${quotes.length})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className="c-tab"
              aria-current={tab === k ? "page" : undefined}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="pt-3">
          {tab === "activity" ? (
            <ActivityList oppId={opp.id} acts={acts} canEdit={canEdit} />
          ) : (
            <div className="space-y-2">
              {building ? <QuoteBuilder opp={opp} onDone={() => setBuilding(false)} /> : null}
              <QuoteList oppId={opp.id} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CallLogForm({
  opp,
  market,
  provider,
  onDone,
}: {
  opp: Opportunity;
  market: string;
  provider: boolean;
  onDone: () => void;
}) {
  const { state, act } = useCrm();
  const { me } = useShell();
  const [channel, setChannel] = useState<"Điện thoại" | "Zalo" | "Tổng đài">(
    provider ? "Tổng đài" : "Điện thoại",
  );
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [callback, setCallback] = useState<number | null>(null);
  const outcomes = state.settings.catalogs.outcomes.items.filter((i) => i.active).map((i) => i.label);
  const slots = callbackSlots(state, market);

  return (
    <form
      className="c-nba"
      aria-label="Ghi kết quả cuộc gọi"
      onSubmit={(e) => {
        e.preventDefault();
        if (!outcome) return;
        act(
          {
            type: "logCall",
            oppId: opp.id,
            channel,
            outcome,
            note: note.trim(),
            callbackAt: callback ?? undefined,
            actor: me,
          },
          callback !== null ? `Đã ghi kết quả, hẹn gọi lại ${fmtDue(callback)}` : "Đã ghi kết quả cuộc gọi",
        );
        onDone();
      }}
    >
      <h3>Ghi kết quả cuộc gọi</h3>
      <div className="flex flex-wrap items-center gap-3">
        <span className="c-lbl">Đã gọi qua</span>
        {(provider ? (["Tổng đài"] as const) : (["Điện thoại", "Zalo"] as const)).map((c) => (
          <label key={c} className="inline-flex items-center gap-1">
            <input type="radio" name="call-channel" checked={channel === c} onChange={() => setChannel(c)} />
            {c}
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kết quả">
        {outcomes.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={outcome === o}
            className={`c-btn ${outcome === o ? "is-brand" : ""}`}
            onClick={() => setOutcome(o)}
          >
            {o}
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
        <span className="c-lbl">Hẹn gọi lại (trong khung gọi của khách):</span>
        {slots.map((s) => (
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
        <button type="submit" className="c-btn is-brand" disabled={!outcome}>
          Lưu kết quả
        </button>
        <button type="button" className="c-btn" onClick={onDone}>
          Hủy
        </button>
      </div>
    </form>
  );
}

function ImportantDates({ opp, info, canEdit }: { opp: Opportunity; info: LeadInfo; canEdit: boolean }) {
  const { act } = useCrm();
  const { me } = useShell();
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  return (
    <div>
      <b>Ngày quan trọng</b>
      {info.dates.length ? (
        <ul className="mt-1 mb-1 list-disc pl-5">
          {info.dates.map((d) => (
            <li key={d.label + d.date}>
              {d.label}: <b>{d.date}</b>
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
            if (!label.trim() || !date.trim()) return;
            act(
              { type: "addDate", oppId: opp.id, label: label.trim(), date: date.trim(), actor: me },
              "Đã thêm ngày quan trọng",
            );
            setLabel("");
            setDate("");
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
            placeholder="dd/mm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-20 rounded-control border border-line bg-surface px-2 py-1"
          />
          <button type="submit" className="c-btn">
            Thêm
          </button>
        </form>
      ) : null}
    </div>
  );
}

function ActivityList({ oppId, acts, canEdit }: { oppId: string; acts: Activity[]; canEdit: boolean }) {
  const { act } = useCrm();
  const { me } = useShell();
  const [note, setNote] = useState("");
  return (
    <div>
      {canEdit ? (
        <form
          className="mb-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            act({ type: "addNote", oppId, text: note.trim(), actor: me }, "Đã thêm ghi chú");
            setNote("");
          }}
        >
          <input
            aria-label="Ghi chú"
            placeholder="Thêm ghi chú…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1.5"
          />
          <button type="submit" className="c-btn">
            Lưu
          </button>
        </form>
      ) : null}
      {acts.length ? (
        <ul className="m-0 list-none p-0" aria-label="Dòng hoạt động">
          {acts.map((a) => (
            <li key={a.id} className="flex gap-2 border-t border-line-2 py-1.5 first:border-t-0">
              <span className="c-pill is-n shrink-0">{ACT_LABEL[a.kind]}</span>
              <span className="min-w-0 flex-1">{a.text}</span>
              <span className="c-lbl shrink-0 tabular">
                {a.actor} · {a.time}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="c-lbl m-0">Chưa có hoạt động.</p>
      )}
    </div>
  );
}
