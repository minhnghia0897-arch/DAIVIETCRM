"use client";

import { Plug } from "lucide-react";
import { createContext, useContext, useEffect, useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import {
  STATUS_LABEL,
  actionsFor,
  configErrors,
  connectBlockers,
  fillFromLogin,
  isOauthToken,
  loginFields,
  missingSummary,
  quickFields,
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
  type ConfigField,
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

type Result = { ok: boolean; message: string };

/** Một đấu nối đã lưu ở database (bản thật); không bao giờ chứa giá trị khóa. */
export interface LiveIntegrationRow {
  status: IntegrationStatus;
  config: Record<string, unknown>;
  prerequisitesDone: string[];
  replyMode?: ReplyMode;
  /** Tên khóa → thời điểm cập nhật. */
  secrets: Record<string, string>;
}

/**
 * Bản thật: khóa đi thẳng vào Supabase Vault, cấu hình lưu bảng `integrations` qua server action (kiểm quyền,
 * nhật ký ở database). Không có thì màn chạy mô phỏng trong trình duyệt như bản demo.
 */
export interface LiveIntegrations {
  rows: Record<string, LiveIntegrationRow>;
  saveSecrets: (input: { key: string; secrets: Record<string, string> }) => Promise<Result>;
  removeSecret: (input: { key: string; name: string }) => Promise<Result>;
  saveSettings: (input: {
    key: string;
    config?: Record<string, unknown>;
    prerequisitesDone?: string[];
    replyMode?: ReplyMode;
    status?: "paused" | "not_connected";
  }) => Promise<Result>;
}

const LiveContext = createContext<LiveIntegrations | null>(null);

/** Gọi server action của bản thật và báo kết quả bằng toast. */
function useLive() {
  const live = useContext(LiveContext);
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (f: (l: LiveIntegrations) => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      if (!live) return;
      const r = await f(live);
      toast(r.message, r.ok ? "ok" : "err");
      after?.(r);
    });
  return { live, run, pending };
}

export function IntegrationSettings({ live }: { live?: LiveIntegrations }) {
  return (
    <LiveContext.Provider value={live ?? null}>
      <IntegrationList />
    </LiveContext.Provider>
  );
}

function IntegrationList() {
  const { state, act } = useCrm();
  const live = useContext(LiveContext);
  // Bản thật: trạng thái, cấu hình, khóa đã có lấy từ database mỗi lần trang tải lại sau thao tác.
  useEffect(() => {
    if (live) act({ type: "intHydrate", rows: live.rows });
  }, [live, act]);
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
          {live
            ? "Khóa dán vào đây lưu thẳng vào kho bí mật (Supabase Vault), không hiện lại, mọi thao tác ghi nhật ký kiểm toán. Đấu nối chỉ chuyển sang Đã kết nối khi bộ nối của nhà cung cấp kiểm tra được khóa; bộ nối làm theo giai đoạn ghi trên nhãn."
            : "Bản mô phỏng: bấm Kết nối chưa gọi API thật của nhà cung cấp. Khi chạy thật, khóa lưu ở Supabase Vault, webhook kiểm chữ ký và mọi thao tác ở đây ghi nhật ký kiểm toán. Đấu nối ngoài tháng 1 cấu hình sẵn được ở đây; adapter thật làm theo giai đoạn ghi trên nhãn."}
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
  const { live, run } = useLive();
  const toast = useToast();
  const [quick, setQuick] = useState(false);
  const missing = missingSummary(def, st);
  const open = tab !== null;
  const days = tokenDaysLeft(st, simDate(state.minutes));
  const actions = actionsFor(st.status);
  // Kết nối nhanh và chi tiết không mở cùng lúc, để hai nơi không sửa cùng một cấu hình.
  function toggleQuick() {
    if (!quick) onOpen(null);
    setQuick(!quick);
  }

  return (
    <li className="border-t border-line-2 py-2.5 first:border-t-0" aria-label={def.name}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="c-link min-w-40 flex-1 font-semibold"
          aria-expanded={open}
          onClick={() => {
            setQuick(false);
            onOpen(open ? null : "prereq");
          }}
        >
          {def.name}
        </button>
        <span className="c-pill is-n">{phaseLabels[def.phase]}</span>
        <span className={`c-pill ${TONE[st.status]}`}>{STATUS_LABEL[st.status]}</span>
        {days !== null && st.status === "connected" ? (
          <span className={`c-pill ${days < 3 ? "is-err" : "is-n"}`}>Token còn {days} ngày</span>
        ) : null}
        <span className="flex flex-wrap gap-1">
          {actions.includes("connect") ? (
            <button type="button" className="c-btn is-brand" aria-expanded={quick} onClick={toggleQuick}>
              {def.connectMode === "enable" ? "Bật" : "Kết nối"}
            </button>
          ) : null}
          {actions.includes("test") ? (
            <button
              type="button"
              className="c-btn"
              onClick={() =>
                live
                  ? toast(`Bộ nối ${def.name} chưa được viết, chưa gửi được dữ liệu thử thật`, "err")
                  : act({ type: "intTest", key: def.key, actor: me }, `Đã gửi dữ liệu thử qua ${def.name}`)
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
                live
                  ? run((l) => l.saveSettings({ key: def.key, status: "paused" }))
                  : act(
                      { type: "intPause", key: def.key, paused: true, actor: me },
                      `Đã tạm dừng ${def.name}`,
                    )
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
            <button type="button" className="c-btn" aria-expanded={quick} onClick={toggleQuick}>
              Kết nối lại
            </button>
          ) : null}
          {actions.includes("disconnect") ? (
            <button
              type="button"
              className="c-btn"
              style={{ color: "var(--err)" }}
              onClick={() =>
                live
                  ? run(async (l) => {
                      // Ngắt: thu hồi token đăng nhập, giữ khóa nhập tay (App Secret…).
                      for (const name of def.secrets.filter((n) => isOauthToken(def, n) && st.secrets[n]))
                        await l.removeSecret({ key: def.key, name });
                      return l.saveSettings({ key: def.key, status: "not_connected" });
                    })
                  : act({ type: "intDisconnect", key: def.key, actor: me }, `Đã ngắt ${def.name}`)
              }
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
      {quick ? <QuickConnect def={def} st={st} onClose={() => setQuick(false)} /> : null}
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
      <div className="c-ftabs mb-2" role="tablist" aria-label={`Chi tiết ${def.name}`}>
        {tabs.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className="c-ftab"
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      {def.note ? <p className="mt-0 mb-2 rounded-control bg-surface px-2.5 py-1.5">{def.note}</p> : null}
      {/* Các tab giữ nguyên trong cây, chỉ ẩn, để cấu hình đang nhập dở không mất khi chuyển tab. */}
      <div hidden={tab !== "prereq"}>
        <Prerequisites def={def} />
      </div>
      {hasConfig ? (
        <div hidden={tab !== "config"}>
          <ConfigForm def={def} st={st} />
        </div>
      ) : null}
      {def.secrets.length ? (
        <div hidden={tab !== "secret"}>
          <Secrets def={def} st={st} />
        </div>
      ) : null}
      <div hidden={tab !== "log"}>
        <Log st={st} />
      </div>
    </div>
  );
}

function Prerequisites({ def }: { def: Def }) {
  const { state, act } = useCrm();
  const { me } = useShell();
  const { live, run } = useLive();
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
                    live
                      ? run((l) =>
                          l.saveSettings({
                            key: def.key,
                            prerequisitesDone: on ? done.filter((d) => d !== p.key) : [...done, p.key],
                          }),
                        )
                      : act(
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
  const { live, run } = useLive();
  const [draft, setDraft] = useState<Record<string, unknown>>(st.config);
  const [submitted, setSubmitted] = useState(false);
  const errors = configErrors(def, draft);
  const replyMode = state.settings.replyMode;
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
            // Bản thật chỉ lưu cấu hình hợp lệ (server kiểm lại bằng cùng schema).
            if (live) {
              if (!errors.length) run((l) => l.saveSettings({ key: def.key, config: draft }));
              return;
            }
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
              ) : (
                <FieldInput f={f} value={draft[f.key]} onChange={(v) => setDraft({ ...draft, [f.key]: v })} />
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
                  live
                    ? run((l) => l.saveSettings({ key: def.key, replyMode: m }))
                    : act(
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

const FIELD = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";

/** Một ô cấu hình (trừ bảng ánh xạ), dùng chung cho Kết nối nhanh và tab Cấu hình. */
function FieldInput({
  f,
  value,
  onChange,
}: {
  f: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  // Ô nhiều dòng giữ nguyên chữ đang gõ; mảng giá trị tách từ đó, để xuống dòng không làm dính hai ID.
  const [raw, setRaw] = useState(() => (Array.isArray(value) ? value.join("\n") : ""));
  if (f.kind === "checks") {
    const cur = (value as string[] | undefined) ?? [];
    return (
      <fieldset className="m-0 border-0 p-0" aria-label={f.label}>
        <legend className="c-lbl">{f.label}</legend>
        {f.options?.map((o) => {
          const on = cur.includes(o.value);
          return (
            <label key={o.value} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? cur.filter((x) => x !== o.value) : [...cur, o.value])}
              />
              {o.label}
            </label>
          );
        })}
      </fieldset>
    );
  }
  return (
    <label className="c-lbl block">
      {f.label}
      {f.kind === "list" ? (
        <textarea
          aria-label={f.label}
          placeholder={f.placeholder}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            onChange(
              e.target.value
                .split(/[\n,]/)
                .map((x) => x.trim())
                .filter(Boolean),
            );
          }}
          className={`${FIELD} h-16`}
        />
      ) : f.kind === "select" ? (
        <select
          aria-label={f.label}
          value={(value as string | undefined) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={FIELD}
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
          value={(value as string | undefined) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={FIELD}
        />
      )}
    </label>
  );
}

/**
 * Địa chỉ nhận dữ liệu để Owner dán vào trang quản trị của nhà cung cấp. Khi chạy thật là tên miền của CRM;
 * webhook kiểm chữ ký bằng khóa vừa dán.
 */
function WebhookUrl({ path }: { path: string }) {
  const toast = useToast();
  const url = `${typeof window === "undefined" ? "" : window.location.origin}${path}`;
  return (
    <div>
      <span className="c-lbl">Địa chỉ nhận dữ liệu (dán vào trang quản trị của nhà cung cấp)</span>
      <div className="mt-0.5 flex gap-1.5">
        <input
          readOnly
          aria-label="Địa chỉ nhận dữ liệu"
          value={url}
          className={`${FIELD} mt-0 min-w-0 flex-1 bg-surface-2`}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          className="c-btn"
          onClick={async () => {
            let ok = true;
            try {
              await navigator.clipboard.writeText(url);
            } catch {
              ok = false;
            }
            toast(ok ? "Đã sao chép địa chỉ" : "Không sao chép được, hãy chọn và sao chép tay");
          }}
        >
          Sao chép
        </button>
      </div>
    </div>
  );
}

const LOGIN_PROVIDER: Record<string, string> = {
  meta_lead_ads: "Facebook",
  meta_messenger: "Facebook",
  zalo_oa: "Zalo",
  zalo_zns: "Zalo",
  tiktok_lead_forms: "TikTok",
  tiktok_messaging: "TikTok",
  tiktok_shop: "TikTok Shop",
};

/**
 * Kết nối nhanh: chỉ hỏi khóa và ô không đoán được; phần còn lại điền sẵn hoặc chọn từ danh sách sau khi đăng nhập.
 * Một lần bấm: lưu khóa, lưu cấu hình, (đăng nhập), kết nối, gửi dữ liệu thử.
 */
function QuickConnect({ def, st, onClose }: { def: Def; st: IntegrationState; onClose: () => void }) {
  const { state, act } = useCrm();
  const { me } = useShell();
  const { live, run, pending } = useLive();
  const needed = requiredSecrets(def);
  // Bản thật chưa có ứng dụng OAuth đứng tên showroom: ô chọn sau đăng nhập (Page, OA, form) nhập tay.
  const manualLogin: ConfigField[] = live
    ? loginFields(def).map((f) => ({
        ...f,
        kind: f.kind === "checks" ? "list" : "text",
        options: undefined,
        fromLogin: false,
      }))
    : [];
  const fields = [...quickFields(def), ...manualLogin];
  const done = state.settings.prereqs[def.key] ?? [];
  const allDone = def.prerequisites.every((p) => done.includes(p.key));
  const [values, setValues] = useState<Record<string, string>>({});
  const [cfg, setCfg] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, st.config[f.key]]).filter(([, v]) => v !== undefined)),
  );
  const [prereqOk, setPrereqOk] = useState(allDone);
  const [errors, setErrors] = useState<string[]>([]);
  const [login, setLogin] = useState<Record<string, unknown> | null>(null);
  const pasted = needed.filter((n) => values[n]?.trim());
  const provider = LOGIN_PROVIDER[def.key] ?? def.name;

  function finish(choices?: Record<string, unknown>) {
    act(
      {
        type: "intQuick",
        key: def.key,
        secretNames: pasted,
        config: cfg,
        prereqsDone: prereqOk && !allDone,
        choices,
        actor: me,
      },
      `Đang kết nối ${def.name}`,
    );
    setValues({});
    setLogin(null);
    onClose();
  }

  /** Bản thật: lưu khóa vào Vault, lưu cấu hình và điều kiện; không giả lập "Đã kết nối". */
  function saveLive() {
    const secrets = Object.fromEntries(pasted.map((n) => [n, values[n]]));
    const prereqs = prereqOk ? def.prerequisites.map((p) => p.key) : done;
    run(
      async (l) => {
        if (pasted.length) {
          const r = await l.saveSecrets({ key: def.key, secrets });
          if (!r.ok) return r;
        }
        const r = await l.saveSettings({
          key: def.key,
          config: { ...st.config, ...cfg },
          prerequisitesDone: prereqs,
        });
        if (!r.ok) return r;
        return {
          ok: true,
          message: def.implemented
            ? `Đã lưu khóa và cấu hình ${def.name}, đang kiểm tra kết nối`
            : `Đã lưu khóa và cấu hình ${def.name} vào kho bí mật. Bộ nối ${def.name} chưa được viết nên chưa kiểm tra được kết nối thật.`,
        };
      },
      (r) => {
        if (!r.ok) return;
        setValues({});
        onClose();
      },
    );
  }

  function submit() {
    const preview: IntegrationState = {
      ...st,
      secrets: { ...st.secrets, ...Object.fromEntries(pasted.map((n) => [n, "x"])) },
      config: { ...st.config, ...cfg },
    };
    const errs = live
      ? [
          ...needed.filter((n) => !preview.secrets[n]).map((n) => `Chưa nhập ${def.secretLabels?.[n] ?? n}`),
          ...configErrors(def, preview.config),
        ]
      : connectBlockers(def, preview);
    setErrors(errs);
    if (errs.length) return;
    // Bản thật chưa có ứng dụng OAuth đứng tên showroom: chưa mở cửa sổ đăng nhập mô phỏng.
    if (live) return saveLive();
    if (def.connectMode === "oauth")
      setLogin(
        Object.fromEntries(loginFields(def).map((f) => [f.key, fillFromLogin(def, st.config)[f.key]])),
      );
    else finish();
  }

  return (
    <form
      className="mt-2 space-y-2 rounded-control border border-line bg-surface-2 p-3"
      aria-label={`Kết nối nhanh ${def.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {def.webhookPath ? <WebhookUrl path={def.webhookPath} /> : null}
      {needed.map((name) => {
        const label = def.secretLabels?.[name] ?? name;
        return (
          <label key={name} className="c-lbl block">
            {label}
            <input
              aria-label={label}
              type="password"
              autoComplete="new-password"
              placeholder={st.secrets[name] ? "Đã có, để trống nếu giữ nguyên" : "Dán vào đây"}
              value={values[name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
              className={FIELD}
            />
          </label>
        );
      })}
      {fields.map((f) => (
        <FieldInput key={f.key} f={f} value={cfg[f.key]} onChange={(v) => setCfg({ ...cfg, [f.key]: v })} />
      ))}
      {needed.length === 0 && fields.length === 0 ? (
        <p className="c-lbl m-0">Không cần khóa. Cấu hình đã điền sẵn, sửa được ở tab Cấu hình.</p>
      ) : null}
      {def.prerequisites.length ? (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={prereqOk}
            onChange={(e) => setPrereqOk(e.target.checked)}
          />
          <span>Đã làm xong các bước chuẩn bị: {def.prerequisites.map((p) => p.label).join("; ")}.</span>
        </label>
      ) : null}
      {errors.length ? (
        <ul className="m-0 list-none space-y-1 p-0" aria-label="Còn thiếu để kết nối">
          {errors.map((er) => (
            <li key={er} className="text-err">
              {er}
            </li>
          ))}
        </ul>
      ) : null}
      {login ? (
        <div
          className="rounded-control border border-line bg-surface p-3"
          role="dialog"
          aria-label={`Cấp quyền ${def.name}`}
        >
          <b>Cửa sổ đăng nhập {provider} (mô phỏng)</b>
          <p className="c-lbl my-1">
            CRM xin quyền: {def.oauthScopes}. Sau khi đăng nhập, chọn từ danh sách {provider} trả về, không
            cần gõ ID.
          </p>
          {loginFields(def).map((f) => (
            <FieldInput
              key={f.key}
              f={f}
              value={login[f.key]}
              onChange={(v) => setLogin({ ...login, [f.key]: v })}
            />
          ))}
          <div className="mt-2 flex gap-1.5">
            <button type="button" className="c-btn is-brand" onClick={() => finish(login)}>
              Cho phép
            </button>
            <button type="button" className="c-btn" onClick={() => setLogin(null)}>
              Hủy
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button type="submit" className="c-btn is-brand" disabled={pending}>
            {live
              ? pending
                ? "Đang lưu…"
                : "Lưu khóa và cấu hình"
              : def.connectMode === "oauth"
                ? `Đăng nhập ${provider} và kết nối`
                : def.connectMode === "enable"
                  ? "Bật"
                  : "Kiểm tra và kết nối"}
          </button>
          <button type="button" className="c-btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      )}
      <p className="c-lbl m-0">
        Khóa chỉ lưu ở máy chủ, không hiện lại. Kết nối xong, CRM tự gửi dữ liệu thử để kiểm tra.
      </p>
    </form>
  );
}

function Secrets({ def, st }: { def: Def; st: IntegrationState }) {
  const { act } = useCrm();
  const { me } = useShell();
  const { live, run, pending } = useLive();
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <ul className="m-0 list-none space-y-2 p-0">
      {def.secrets.map((name) => {
        const label = def.secretLabels?.[name] ?? name;
        const viaOauth = isOauthToken(def, name);
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
                  if (live) {
                    const value = values[name];
                    run(
                      (l) => l.saveSecrets({ key: def.key, secrets: { [name]: value } }),
                      (r) => r.ok && setValues((v) => ({ ...v, [name]: "" })),
                    );
                    return;
                  }
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
                <button type="submit" className="c-btn" disabled={pending}>
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
  if (!st.log.length)
    return <p className="c-lbl m-0">Chưa có sự kiện nào. Mỗi lần gọi, nhắn, mua hàng đều được ghi ở đây.</p>;
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
