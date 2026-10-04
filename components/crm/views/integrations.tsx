"use client";

import { Plug } from "lucide-react";
import { useState } from "react";

import {
  STATUS_LABEL,
  actionsFor,
  configErrors,
  connectBlockers,
  missingSummary,
  prerequisiteWarnings,
  requiredSecrets,
  tokenDaysLeft,
  type IntegrationState,
  type IntegrationStatus,
} from "@/lib/integrations/connection";
import {
  LEAD_FIELDS,
  groupLabels,
  integrations,
  phaseLabels,
  type IntegrationDefinition,
  type IntegrationGroup,
} from "@/lib/integrations/registry";
import { PageHead } from "../parts";
import { useShell } from "../shell-context";
import { simDate, useCrm, type ReplyMode } from "../store";

// Cài đặt, Tích hợp (CLAUDE.md 10.2, 11.2): mọi đấu nối trong sổ đăng ký, kết nối, gửi dữ liệu thử, tạm dừng,
// ngắt; tab Điều kiện, Cấu hình, Bí mật, Nhật ký. Khóa bí mật không bao giờ hiện lại sau khi lưu.

const TONE: Record<IntegrationStatus, string> = {
  not_available: "is-n",
  not_connected: "is-n",
  connecting: "is-ai",
  connected: "is-ok",
  error: "is-err",
  paused: "is-warn",
};

const REPLY: Record<ReplyMode, string> = {
  crm: "Trả lời trên CRM",
  external: "Trả lời ở công cụ khác, CRM chỉ đọc",
  off: "Tắt",
};

const SAMPLE_QUESTIONS = [
  "Họ và tên",
  "Số điện thoại",
  "Bạn đang sống ở nước nào?",
  "Tỉnh người nhận quà",
  "Bạn quan tâm sản phẩm nào?",
  "Dịp tặng quà",
];

const fmt = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : "—";

type Def = IntegrationDefinition;
const DEFS = integrations as readonly Def[];

export function IntegrationSettings() {
  const { state } = useCrm();
  const [open, setOpen] = useState<{ key: string; tab: Tab } | null>(null);
  const states = state.settings.integrationStates;
  const count = (st: IntegrationStatus) => DEFS.filter((d) => states[d.key]?.status === st).length;

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={Plug}
          color="var(--brand)"
          kicker="Chỉ Owner kết nối, ngắt, đổi cấu hình"
          title="Tích hợp"
        >
          <span className="c-pill is-ok">Đã kết nối {count("connected")}</span>
          {count("error") ? <span className="c-pill is-err">Lỗi {count("error")}</span> : null}
          <span className="c-pill is-n">Chưa kết nối {count("not_connected")}</span>
          {count("not_available") ? (
            <span className="c-pill is-n">Sắp có {count("not_available")}</span>
          ) : null}
        </PageHead>
        <p className="c-lbl mx-4 mt-0 mb-3">
          Bản mô phỏng: bấm Kết nối chưa gọi API thật của nhà cung cấp. Khi chạy thật, khóa lưu ở Supabase
          Vault, webhook kiểm chữ ký và mọi thao tác ở đây ghi nhật ký kiểm toán. Đấu nối ngoài tháng 1 cấu
          hình sẵn được ở đây; adapter thật làm theo giai đoạn ghi trên nhãn.
        </p>
      </section>
      {(Object.keys(groupLabels) as IntegrationGroup[]).map((g) => (
        <section key={g} className="c-card" aria-label={groupLabels[g]}>
          <div className="c-ch">
            <h2>{groupLabels[g]}</h2>
          </div>
          <ul className="m-0 list-none px-4 pb-2">
            {DEFS.filter((d) => d.group === g).map((d) => (
              <IntegrationRow
                key={d.key}
                def={d}
                st={states[d.key]}
                tab={open?.key === d.key ? open.tab : null}
                onOpen={(tab) => setOpen(tab ? { key: d.key, tab } : null)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function IntegrationRow({
  def,
  st,
  tab,
  onOpen,
}: {
  def: Def;
  st: IntegrationState;
  /** Tab đang mở của drawer; null là đóng. */
  tab: Tab | null;
  onOpen: (tab: Tab | null) => void;
}) {
  const { state, act } = useCrm();
  const { me } = useShell();
  const [oauth, setOauth] = useState(false);
  const done = state.settings.prereqs[def.key] ?? [];
  const blockers = connectBlockers(def, st);
  const missing = missingSummary(def, st);
  const open = tab !== null;
  const connectLabel = def.connectMode === "enable" ? "Bật" : "Kết nối";
  // Mở thẳng tab còn thiếu: khóa trước, rồi cấu hình.
  const setupTab: Tab = requiredSecrets(def).some((x) => !st.secrets[x])
    ? "secret"
    : configErrors(def, st.config).length
      ? "config"
      : "prereq";
  const warnings = prerequisiteWarnings(def, done);
  const days = tokenDaysLeft(st, simDate(state.minutes));
  const actions = actionsFor(st.status);

  function connect() {
    if (def.connectMode === "oauth") setOauth(true);
    else act({ type: "intConnect", key: def.key, actor: me }, `Đang kết nối ${def.name}`);
  }

  return (
    <li className="border-t border-line-2 py-2.5 first:border-t-0" aria-label={def.name}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="c-link min-w-40 flex-1 font-semibold"
          aria-expanded={open}
          onClick={() => onOpen(open ? null : "prereq")}
        >
          {def.name}
        </button>
        <span className="c-pill is-n">{phaseLabels[def.phase]}</span>
        <span className={`c-pill ${TONE[st.status]}`}>{STATUS_LABEL[st.status]}</span>
        {days !== null && st.status === "connected" ? (
          <span className={`c-pill ${days < 3 ? "is-err" : "is-n"}`}>Token còn {days} ngày</span>
        ) : null}
        <span className="flex flex-wrap gap-1">
          {actions.includes("connect") && blockers.length ? (
            <button type="button" className="c-btn is-brand" onClick={() => onOpen(setupTab)}>
              Thiết lập
            </button>
          ) : actions.includes("connect") ? (
            <button type="button" className="c-btn is-brand" onClick={connect}>
              {connectLabel}
            </button>
          ) : null}
          {actions.includes("test") ? (
            <button
              type="button"
              className="c-btn"
              onClick={() =>
                act({ type: "intTest", key: def.key, actor: me }, `Đã gửi dữ liệu thử qua ${def.name}`)
              }
            >
              Gửi dữ liệu thử
            </button>
          ) : null}
          {actions.includes("pause") ? (
            <button
              type="button"
              className="c-btn"
              onClick={() =>
                act({ type: "intPause", key: def.key, paused: true, actor: me }, `Đã tạm dừng ${def.name}`)
              }
            >
              Tạm dừng
            </button>
          ) : null}
          {actions.includes("resume") ? (
            <button
              type="button"
              className="c-btn"
              onClick={() =>
                act({ type: "intPause", key: def.key, paused: false, actor: me }, `Đã chạy lại ${def.name}`)
              }
            >
              Chạy lại
            </button>
          ) : null}
          {actions.includes("reconnect") ? (
            <button type="button" className="c-btn" disabled={blockers.length > 0} onClick={connect}>
              Kết nối lại
            </button>
          ) : null}
          {actions.includes("disconnect") ? (
            <button
              type="button"
              className="c-btn"
              style={{ color: "var(--err)" }}
              onClick={() => act({ type: "intDisconnect", key: def.key, actor: me }, `Đã ngắt ${def.name}`)}
            >
              Ngắt kết nối
            </button>
          ) : null}
        </span>
      </div>
      <p className="c-lbl mt-0.5 mb-0">
        {def.description}
        {st.lastEventAt ? ` · Nhận dữ liệu gần nhất ${fmt(st.lastEventAt)}` : ""}
      </p>
      {st.status === "error" && st.lastError ? (
        <p role="alert" className="mt-1.5 mb-0 rounded-control bg-err-soft px-2.5 py-1.5 text-err">
          {st.lastError}
        </p>
      ) : null}
      {st.status === "not_connected" && missing.length ? (
        <p className="c-lbl mt-1 mb-0">Còn thiếu: {missing.join(", ")}.</p>
      ) : null}
      {oauth ? (
        <div
          className="mt-2 rounded-control border border-line bg-surface-2 p-3"
          role="dialog"
          aria-label={`Cấp quyền ${def.name}`}
        >
          <b>Cửa sổ đăng nhập của nhà cung cấp (mô phỏng)</b>
          <p className="c-lbl my-1">
            CRM xin quyền: {def.oauthScopes}. Owner đăng nhập bằng tài khoản quản trị của showroom trên nhà
            cung cấp.
          </p>
          {warnings.length ? (
            <p className="my-1 text-warn">Chưa đánh dấu điều kiện: {warnings.join("; ")}.</p>
          ) : null}
          <div className="flex gap-1.5">
            <button
              type="button"
              className="c-btn is-brand"
              onClick={() => {
                setOauth(false);
                act({ type: "intConnect", key: def.key, actor: me }, `Đã cấp quyền cho ${def.name}`);
              }}
            >
              Cho phép
            </button>
            <button type="button" className="c-btn" onClick={() => setOauth(false)}>
              Hủy
            </button>
          </div>
        </div>
      ) : null}
      {tab ? <Drawer key={tab} def={def} st={st} initialTab={tab} /> : null}
    </li>
  );
}

type Tab = "prereq" | "config" | "secret" | "log";

function Drawer({ def, st, initialTab }: { def: Def; st: IntegrationState; initialTab: Tab }) {
  const hasConfig = Boolean(def.configFields?.length) || Boolean(def.supportsReplyMode);
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: [Tab, string][] = [
    ["prereq", "Điều kiện"],
    ...(hasConfig ? ([["config", "Cấu hình"]] as [Tab, string][]) : []),
    ...(def.secrets.length ? ([["secret", "Bí mật"]] as [Tab, string][]) : []),
    ["log", `Nhật ký (${st.log.length})`],
  ];
  return (
    <div className="mt-2 rounded-control bg-surface-2 p-3">
      <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label={`Chi tiết ${def.name}`}>
        {tabs.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`c-btn ${tab === k ? "is-brand" : ""}`}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      {def.note ? <p className="mt-0 mb-2 rounded-control bg-surface px-2.5 py-1.5">{def.note}</p> : null}
      {tab === "prereq" ? <Prerequisites def={def} /> : null}
      {tab === "config" ? <ConfigForm def={def} st={st} /> : null}
      {tab === "secret" ? <Secrets def={def} st={st} /> : null}
      {tab === "log" ? <Log st={st} /> : null}
    </div>
  );
}

function Prerequisites({ def }: { def: Def }) {
  const { state, act } = useCrm();
  const { me } = useShell();
  const prereqs = state.settings.prereqs;
  const done = prereqs[def.key] ?? [];
  return (
    <div>
      {def.prerequisites.length === 0 ? <p className="c-lbl m-0">Không có điều kiện riêng.</p> : null}
      <ul className="m-0 list-none space-y-1 p-0">
        {def.prerequisites.map((p) => {
          const on = done.includes(p.key);
          return (
            <li key={p.key}>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    act(
                      {
                        type: "setSettings",
                        patch: {
                          prereqs: {
                            ...prereqs,
                            [def.key]: on ? done.filter((d) => d !== p.key) : [...done, p.key],
                          },
                        },
                        actor: me,
                        label: on ? "Bỏ đánh dấu điều kiện" : "Đánh dấu điều kiện",
                        detail: `${def.name}: ${p.label}`,
                      },
                      on ? "Đã bỏ đánh dấu" : "Đã đánh dấu điều kiện",
                    )
                  }
                  className="mt-1"
                />
                {p.label}
              </label>
            </li>
          );
        })}
      </ul>
      <p className="c-lbl mt-2 mb-0">Hướng dẫn từng bước: docs/integrations/{def.key}.md</p>
    </div>
  );
}

function ConfigForm({ def, st }: { def: Def; st: IntegrationState }) {
  const { state, act } = useCrm();
  const { me } = useShell();
  const [draft, setDraft] = useState<Record<string, unknown>>(st.config);
  const [submitted, setSubmitted] = useState(false);
  const errors = configErrors(def, draft);
  const replyMode = state.settings.replyMode;
  const field = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";
  const mapping = (draft.fieldMapping as Record<string, string> | undefined) ?? {};

  return (
    <div className="space-y-3">
      {def.configFields?.length ? (
        <form
          className="space-y-2"
          aria-label={`Cấu hình ${def.name}`}
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            act(
              { type: "intConfig", key: def.key, config: draft, actor: me },
              errors.length ? "Đã lưu nháp cấu hình, còn ô chưa hợp lệ" : "Đã lưu cấu hình",
            );
          }}
        >
          {def.configFields.map((f) => (
            <div key={f.key}>
              {f.kind === "mapping" ? (
                <fieldset className="m-0 border-0 p-0">
                  <legend className="c-lbl">{f.label}</legend>
                  <table className="c-rl">
                    <tbody>
                      {SAMPLE_QUESTIONS.map((q) => (
                        <tr key={q}>
                          <td>{q}</td>
                          <td>
                            <select
                              aria-label={`Trường lead cho câu "${q}"`}
                              value={mapping[q] ?? ""}
                              onChange={(e) =>
                                setDraft({ ...draft, fieldMapping: { ...mapping, [q]: e.target.value } })
                              }
                              className="rounded-control border border-line bg-surface px-1.5 py-1"
                            >
                              <option value="">Chưa ánh xạ (lưu vào chi tiết nguồn)</option>
                              {LEAD_FIELDS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="c-lbl mt-1 mb-0">
                    Form mới chưa ánh xạ thì lead vẫn vào, phần chưa ánh xạ lưu trong chi tiết nguồn và báo
                    Owner.
                  </p>
                </fieldset>
              ) : f.kind === "checks" ? (
                <fieldset className="m-0 border-0 p-0" aria-label={f.label}>
                  <legend className="c-lbl">{f.label}</legend>
                  {f.options?.map((o) => {
                    const cur = (draft[f.key] as string[] | undefined) ?? [];
                    const on = cur.includes(o.value);
                    return (
                      <label key={o.value} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setDraft({
                              ...draft,
                              [f.key]: on ? cur.filter((x) => x !== o.value) : [...cur, o.value],
                            })
                          }
                        />
                        {o.label}
                      </label>
                    );
                  })}
                </fieldset>
              ) : (
                <label className="c-lbl block">
                  {f.label}
                  {f.kind === "list" ? (
                    <textarea
                      aria-label={f.label}
                      placeholder={f.placeholder}
                      value={((draft[f.key] as string[] | undefined) ?? []).join("\n")}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [f.key]: e.target.value
                            .split("\n")
                            .map((x) => x.trim())
                            .filter(Boolean),
                        })
                      }
                      className={`${field} h-16`}
                    />
                  ) : f.kind === "select" ? (
                    <select
                      aria-label={f.label}
                      value={(draft[f.key] as string | undefined) ?? ""}
                      onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                      className={field}
                    >
                      <option value="">Chọn…</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label={f.label}
                      placeholder={f.placeholder}
                      value={(draft[f.key] as string | undefined) ?? ""}
                      onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                      className={field}
                    />
                  )}
                </label>
              )}
            </div>
          ))}
          {submitted && errors.length ? (
            <ul className="m-0 list-none space-y-1 p-0" aria-label="Lỗi cấu hình">
              {errors.map((er) => (
                <li key={er} className="text-err">
                  {er}
                </li>
              ))}
            </ul>
          ) : null}
          <button type="submit" className="c-btn is-brand">
            Lưu cấu hình
          </button>
        </form>
      ) : null}
      {def.supportsReplyMode ? (
        <div role="radiogroup" aria-label={`Chế độ trả lời ${def.name}`}>
          <b>Chế độ trả lời</b>
          {(Object.keys(REPLY) as ReplyMode[]).map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input
                type="radio"
                name={`reply-${def.key}`}
                checked={(replyMode[def.key] ?? "crm") === m}
                onChange={() =>
                  act(
                    {
                      type: "setSettings",
                      patch: { replyMode: { ...replyMode, [def.key]: m } },
                      actor: me,
                      label: "Đổi chế độ trả lời",
                      detail: `${def.name}: ${REPLY[m]}`,
                    },
                    `Đã lưu: ${REPLY[m]}`,
                  )
                }
              />
              {REPLY[m]}
            </label>
          ))}
          <p className="c-lbl mt-1 mb-0">Mỗi kênh chỉ có một nơi trả lời.</p>
        </div>
      ) : null}
    </div>
  );
}

function Secrets({ def, st }: { def: Def; st: IntegrationState }) {
  const { act } = useCrm();
  const { me } = useShell();
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <ul className="m-0 list-none space-y-2 p-0">
      {def.secrets.map((name) => {
        const label = def.secretLabels?.[name] ?? name;
        const viaOauth = def.connectMode === "oauth" && /token/.test(name);
        return (
          <li key={name}>
            <b>{label}</b>
            <span className="c-lbl block">
              {st.secrets[name] ? `Đã có, cập nhật ${fmt(st.secrets[name])}` : "Chưa có"}
            </span>
            {viaOauth ? (
              <span className="c-lbl">
                Nhận tự động khi bấm Kết nối và cấp quyền; làm mới trước khi hết hạn.
              </span>
            ) : (
              <form
                className="mt-1 flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!values[name]?.trim()) return;
                  act(
                    { type: "intSecret", key: def.key, name, actor: me },
                    st.secrets[name] ? "Đã thay khóa" : "Đã lưu khóa",
                  );
                  setValues((v) => ({ ...v, [name]: "" }));
                }}
              >
                <input
                  aria-label={label}
                  type="password"
                  autoComplete="off"
                  placeholder={st.secrets[name] ? "Nhập khóa mới để thay" : "Dán khóa vào đây"}
                  value={values[name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                  className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1.5"
                />
                <button type="submit" className="c-btn">
                  {st.secrets[name] ? "Thay khóa" : "Lưu khóa"}
                </button>
              </form>
            )}
          </li>
        );
      })}
      <li className="c-lbl">Giá trị khóa không bao giờ hiện lại sau khi lưu.</li>
    </ul>
  );
}

function Log({ st }: { st: IntegrationState }) {
  if (!st.log.length) return <p className="c-lbl m-0">Chưa có sự kiện nào.</p>;
  return (
    <div className="c-tw">
      <table className="c-table" aria-label="Nhật ký đấu nối">
        <thead>
          <tr>
            <th>Thời điểm</th>
            <th>Loại sự kiện</th>
            <th>Xử lý</th>
            <th>Lỗi</th>
          </tr>
        </thead>
        <tbody>
          {st.log.map((l, i) => (
            <tr key={i}>
              <td className="tabular">{fmt(l.at)}</td>
              <td>{l.type}</td>
              <td>
                <span
                  className={`c-pill ${l.status === "processed" ? "is-ok" : l.status === "failed" ? "is-err" : "is-n"}`}
                >
                  {l.status === "processed" ? "Đã xử lý" : l.status === "failed" ? "Thất bại" : "Đã nhận"}
                </span>
              </td>
              <td className="whitespace-normal c-lbl">{l.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="c-lbl mt-1 mb-0">
        Nhật ký chỉ gồm loại sự kiện, thời điểm, trạng thái, lỗi; không chứa nội dung tin nhắn hay số điện
        thoại.
      </p>
    </div>
  );
}
