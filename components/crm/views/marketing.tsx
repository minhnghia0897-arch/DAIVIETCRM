"use client";

import { Megaphone, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { leadSourceLabel } from "@/lib/leads/labels";
import {
  CAMPAIGN_STATUS,
  PLATFORMS,
  budgetUsed,
  funnelMetrics,
  parseMoney,
  shortVnd,
  vnd,
  type CampaignInput,
  type Platform,
} from "@/lib/marketing/campaign";

import { PageHead } from "../parts";

// Khu Marketing (duyệt 10/10/2026): Tổng quan và Chiến dịch. Chỉ hiện số tổng hợp theo chiến dịch, nguồn, thị trường;
// không có tên, số điện thoại khách (CLAUDE.md mục 5). Bản thật nhận dữ liệu từ server, bản demo truyền dữ liệu mẫu.

type Result = { ok: boolean; message: string };
const FIELD = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";
const TONE = { ok: "is-ok", warn: "is-warn", err: "is-err", n: "is-n" } as const;

export interface OverviewRow {
  kind: "campaign" | "source" | "market";
  key: string;
  label: string;
  leads: number;
  contacted: number;
  converted: number;
  lost: number;
  spend: number;
  budget: number;
}

export interface MarketOption {
  code: string;
  name: string;
}

const pct = (v: number | null) => (v === null ? "–" : `${v.toLocaleString("vi-VN")}%`);
const money = (v: number | null) => (v === null ? "–" : shortVnd(v));
/** "2026-09-20" → "20/09/2026". */
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// ---------------------------------------------------------------------------
// Tổng quan
// ---------------------------------------------------------------------------

export function MarketingOverview({
  rows,
  days,
  markets,
  demo,
}: {
  rows: OverviewRow[];
  /** Số ngày đang xem (7, 30, 90). */
  days: number;
  markets: MarketOption[];
  demo?: boolean;
}) {
  const campaigns = rows.filter((r) => r.kind === "campaign");
  const sources = rows.filter((r) => r.kind === "source").sort((a, b) => b.leads - a.leads);
  const byMarket = rows.filter((r) => r.kind === "market").sort((a, b) => b.leads - a.leads);
  const total = sources.reduce(
    (t, r) => ({
      leads: t.leads + r.leads,
      contacted: t.contacted + r.contacted,
      converted: t.converted + r.converted,
      lost: t.lost + r.lost,
      spend: t.spend,
    }),
    { leads: 0, contacted: 0, converted: 0, lost: 0, spend: campaigns.reduce((t, c) => t + c.spend, 0) },
  );
  const m = funnelMetrics(total);
  const marketName = (code: string) =>
    code === "unknown" ? "Chưa rõ" : (markets.find((x) => x.code === code)?.name ?? code);

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead icon={Megaphone} color="var(--brand)" kicker="Marketing" title="Tổng quan">
          <nav aria-label="Khoảng thời gian" className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Link
                key={d}
                href={demo ? "#" : `/marketing?days=${d}`}
                aria-current={d === days ? "page" : undefined}
                className={`c-btn ${d === days ? "is-blue" : ""}`}
              >
                {d} ngày
              </Link>
            ))}
          </nav>
        </PageHead>
        <p className="c-lbl mx-4 mt-0 mb-3">
          Tính theo lô lead: lead nhận trong {days} ngày gần nhất, kết quả tính đến hôm nay. Chốt là lead đã
          đặt cọc trở lên. Chỉ có số tổng hợp, không có thông tin từng khách.
        </p>
        <div className="c-kpis">
          <div>
            <span className="c-lbl">Chi phí quảng cáo</span>
            <strong>{shortVnd(total.spend)}</strong>
          </div>
          <div>
            <span className="c-lbl">Lead</span>
            <strong>{total.leads}</strong>
          </div>
          <div>
            <span className="c-lbl">Chi phí mỗi lead (mọi nguồn)</span>
            <strong>{money(m.cpl)}</strong>
          </div>
          <div>
            <span className="c-lbl">Tỷ lệ liên hệ được</span>
            <strong>{pct(m.contactRate)}</strong>
          </div>
          <div>
            <span className="c-lbl">Lead → đặt cọc</span>
            <strong>{pct(m.winRate)}</strong>
          </div>
          <div>
            <span className="c-lbl">Chi phí mỗi lead chốt</span>
            <strong>{money(m.costPerWin)}</strong>
          </div>
        </div>
      </section>

      <FunnelTable
        title="Theo chiến dịch"
        note="Lead Form Facebook gắn vào chiến dịch theo mã chiến dịch"
        rows={campaigns}
        label={(r) => r.label}
        withSpend
        empty="Chưa có chiến dịch. Tạo ở tab Chiến dịch."
      />
      <FunnelTable
        title="Theo nguồn lead"
        rows={sources}
        label={(r) => leadSourceLabel(r.key)}
        empty="Chưa có lead trong khoảng này."
      />
      <FunnelTable
        title="Theo thị trường khách"
        rows={byMarket}
        label={(r) => marketName(r.key)}
        empty="Chưa có lead trong khoảng này."
      />
    </div>
  );
}

function FunnelTable({
  title,
  note,
  rows,
  label,
  withSpend,
  empty,
}: {
  title: string;
  note?: string;
  rows: OverviewRow[];
  label: (r: OverviewRow) => string;
  withSpend?: boolean;
  empty: string;
}) {
  return (
    <section className="c-card" aria-label={title}>
      <div className="c-ch">
        <h2>{title}</h2>
        {note ? <span className="c-r c-lbl">{note}</span> : null}
      </div>
      <div className="c-tw">
        <table className="c-table">
          <thead>
            <tr>
              <th>{withSpend ? "Chiến dịch" : "Nhóm"}</th>
              <th className="tabular">Lead</th>
              <th className="tabular">Liên hệ được</th>
              <th className="tabular">Đặt cọc trở lên</th>
              <th className="tabular">Thất bại</th>
              {withSpend ? (
                <>
                  <th className="tabular">Chi phí</th>
                  <th className="tabular">Chi phí mỗi lead</th>
                  <th className="tabular">Đã tiêu ngân sách</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={withSpend ? 8 : 5} className="c-empty">
                  {empty}
                </td>
              </tr>
            ) : null}
            {rows.map((r) => {
              const m = funnelMetrics(r);
              const used = budgetUsed(r.spend, r.budget);
              return (
                <tr key={`${r.kind}:${r.key}`}>
                  <td>{label(r)}</td>
                  <td className="tabular">{r.leads}</td>
                  <td className="tabular">
                    {r.contacted} <span className="c-lbl">({pct(m.contactRate)})</span>
                  </td>
                  <td className="tabular">
                    {r.converted} <span className="c-lbl">({pct(m.winRate)})</span>
                  </td>
                  <td className="tabular">{r.lost}</td>
                  {withSpend ? (
                    <>
                      <td className="tabular">{shortVnd(r.spend)}</td>
                      <td className="tabular">{money(m.cpl)}</td>
                      <td className={`tabular ${used !== null && used > 100 ? "text-err" : ""}`}>
                        {used === null ? "Chưa duyệt" : `${used}%`}
                      </td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Chiến dịch
// ---------------------------------------------------------------------------

export interface CampaignRow {
  id: string;
  name: string;
  platform: Platform;
  externalId: string | null;
  market: string | null;
  startsOn: string | null;
  endsOn: string | null;
  budget: number;
  requestedBudget: number | null;
  status: string;
  ownerName: string | null;
  note: string | null;
  spend: number;
  lastSpendOn: string | null;
}

export interface CampaignActions {
  save: (input: CampaignInput) => Promise<Result>;
  requestBudget: (input: { id: string; amount: number; reason?: string }) => Promise<Result>;
  recordSpend: (input: { campaignId: string; date: string; amount: number }) => Promise<Result>;
  importCsv: (input: { text: string }) => Promise<Result & { errors?: string[] }>;
}

function useRun(onDone?: () => void) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      const r = await fn();
      toast(r.message, r.ok ? "ok" : "err");
      after?.(r);
      if (r.ok) {
        onDone?.();
        router.refresh();
      }
    });
  return { pending, run };
}

export function CampaignsView({
  campaigns,
  markets,
  canManage,
  canApprove,
  today,
  actions,
}: {
  campaigns: CampaignRow[];
  markets: MarketOption[];
  canManage: boolean;
  /** Người duyệt ngân sách (Owner): đặt ngân sách là áp ngay. */
  canApprove: boolean;
  /** Ngày hôm nay theo giờ VN (YYYY-MM-DD), mặc định cho ô ngày chi phí. */
  today: string;
  actions: CampaignActions;
}) {
  const [editing, setEditing] = useState<CampaignRow | "new" | null>(null);
  const [status, setStatus] = useState("");
  const list = campaigns.filter((c) => !status || c.status === status);
  const pending = campaigns.filter((c) => c.requestedBudget).length;

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead icon={Megaphone} color="var(--brand)" kicker="Marketing" title="Chiến dịch">
          {pending ? <span className="c-pill is-warn">Chờ duyệt ngân sách {pending}</span> : null}
          {canManage ? (
            <button type="button" className="c-btn is-brand" onClick={() => setEditing("new")}>
              Tạo chiến dịch
            </button>
          ) : null}
        </PageHead>
        <p className="c-lbl mx-4 mt-0 mb-3">
          Ngân sách {canApprove ? "anh chị đặt được áp ngay" : "mới hoặc tăng thêm phải chờ Owner duyệt"};
          chiến dịch chỉ chạy khi đã có ngân sách được duyệt. Chi phí nhập theo ngày, nhập tay hoặc từ file
          CSV.
        </p>
        <div className="mx-4 mb-3 flex flex-wrap gap-2">
          <select
            aria-label="Lọc theo trạng thái"
            className="rounded-control border border-line bg-surface px-2 py-1"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Mọi trạng thái</option>
            {Object.entries(CAMPAIGN_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {editing ? (
        <CampaignForm
          key={editing === "new" ? "new" : editing.id}
          c={editing === "new" ? null : editing}
          markets={markets}
          canApprove={canApprove}
          save={actions.save}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {canManage ? <SpendImport importCsv={actions.importCsv} /> : null}

      <section className="c-card" aria-label="Danh sách chiến dịch">
        <ul className="m-0 list-none p-0">
          {list.length === 0 ? <li className="c-empty p-4">Chưa có chiến dịch nào.</li> : null}
          {list.map((c) => (
            <CampaignItem
              key={c.id}
              c={c}
              markets={markets}
              canManage={canManage}
              canApprove={canApprove}
              today={today}
              actions={actions}
              onEdit={() => setEditing(c)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function CampaignItem({
  c,
  markets,
  canManage,
  canApprove,
  today,
  actions,
  onEdit,
}: {
  c: CampaignRow;
  markets: MarketOption[];
  canManage: boolean;
  canApprove: boolean;
  today: string;
  actions: CampaignActions;
  onEdit: () => void;
}) {
  const { pending, run } = useRun();
  const [budget, setBudget] = useState("");
  const [spendDate, setSpendDate] = useState(today);
  const [spend, setSpend] = useState("");
  const st = CAMPAIGN_STATUS[c.status] ?? { label: c.status, tone: "n" as const };
  const used = budgetUsed(c.spend, c.budget);
  const market = c.market ? (markets.find((m) => m.code === c.market)?.name ?? c.market) : "Mọi thị trường";

  return (
    <li className="border-t border-line-2 p-4 first:border-t-0" aria-label={c.name}>
      <div className="flex flex-wrap items-center gap-2">
        <b className="min-w-40 flex-1">{c.name}</b>
        <span className="c-pill is-n">{PLATFORMS[c.platform]}</span>
        <span className={`c-pill ${TONE[st.tone]}`}>{st.label}</span>
        {canManage ? (
          <button type="button" className="c-btn" onClick={onEdit}>
            Sửa
          </button>
        ) : null}
      </div>
      <p className="c-lbl m-0 mt-1">
        {market}
        {c.startsOn ? ` · ${dmy(c.startsOn)}${c.endsOn ? ` đến ${dmy(c.endsOn)}` : ""}` : ""}
        {c.externalId ? ` · Mã chiến dịch ${c.externalId}` : ""}
        {c.ownerName ? ` · ${c.ownerName} phụ trách` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        <span>
          Ngân sách đã duyệt: <b className="tabular">{c.budget ? vnd(c.budget) : "chưa có"}</b>
        </span>
        {c.requestedBudget ? (
          <span className="text-warn">
            Chờ Owner duyệt: <b className="tabular">{vnd(c.requestedBudget)}</b>
          </span>
        ) : null}
        <span>
          Đã chi: <b className="tabular">{vnd(c.spend)}</b>
          {used !== null ? (
            <span className={used > 100 ? "text-err" : "c-lbl"}> ({used}% ngân sách)</span>
          ) : null}
        </span>
        {c.lastSpendOn ? <span className="c-lbl">Chi phí nhập đến ngày {dmy(c.lastSpendOn)}</span> : null}
      </div>
      {canManage ? (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <form
            className="flex items-end gap-1.5"
            aria-label={`Ngân sách ${c.name}`}
            onSubmit={(e) => {
              e.preventDefault();
              const amount = parseMoney(budget);
              if (amount === null)
                return run(async () => ({ ok: false, message: "Số tiền không đọc được." }));
              run(
                () => actions.requestBudget({ id: c.id, amount }),
                (r) => r.ok && setBudget(""),
              );
            }}
          >
            <label className="c-lbl">
              {canApprove ? "Đặt ngân sách" : "Xin ngân sách mới"}
              <input
                className={FIELD}
                placeholder="Ví dụ 30tr"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </label>
            <button type="submit" className="c-btn" disabled={pending || !budget.trim()}>
              {canApprove ? "Áp ngân sách" : "Gửi Owner duyệt"}
            </button>
          </form>
          <form
            className="flex items-end gap-1.5"
            aria-label={`Chi phí ${c.name}`}
            onSubmit={(e) => {
              e.preventDefault();
              const amount = parseMoney(spend);
              if (amount === null)
                return run(async () => ({ ok: false, message: "Số tiền không đọc được." }));
              run(
                () => actions.recordSpend({ campaignId: c.id, date: spendDate, amount }),
                (r) => r.ok && setSpend(""),
              );
            }}
          >
            <label className="c-lbl">
              Ngày
              <input
                type="date"
                className={FIELD}
                value={spendDate}
                max={today}
                onChange={(e) => setSpendDate(e.target.value)}
              />
            </label>
            <label className="c-lbl">
              Chi phí ngày đó
              <input
                className={FIELD}
                placeholder="Ví dụ 1.200.000"
                value={spend}
                onChange={(e) => setSpend(e.target.value)}
              />
            </label>
            <button type="submit" className="c-btn" disabled={pending || !spend.trim()}>
              Ghi chi phí
            </button>
          </form>
        </div>
      ) : null}
    </li>
  );
}

function CampaignForm({
  c,
  markets,
  canApprove,
  save,
  onClose,
}: {
  c: CampaignRow | null;
  markets: MarketOption[];
  canApprove: boolean;
  save: CampaignActions["save"];
  onClose: () => void;
}) {
  const { pending, run } = useRun(onClose);
  const [f, setF] = useState({
    name: c?.name ?? "",
    platform: (c?.platform ?? "facebook") as Platform,
    externalId: c?.externalId ?? "",
    market: c?.market ?? "",
    startsOn: c?.startsOn ?? "",
    endsOn: c?.endsOn ?? "",
    note: c?.note ?? "",
    status: c && ["active", "paused", "ended"].includes(c.status) ? c.status : "",
    budget: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <section className="c-card" aria-label={c ? `Sửa ${c.name}` : "Chiến dịch mới"}>
      <div className="c-ch">
        <h2>{c ? `Sửa ${c.name}` : "Chiến dịch mới"}</h2>
      </div>
      <form
        className="c-cb grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const budget = f.budget.trim() ? parseMoney(f.budget) : 0;
          if (budget === null) return run(async () => ({ ok: false, message: "Ngân sách không đọc được." }));
          run(() =>
            save({
              ...(c ? { id: c.id } : {}),
              name: f.name,
              platform: f.platform,
              externalId: f.externalId,
              market: f.market,
              startsOn: f.startsOn,
              endsOn: f.endsOn,
              note: f.note,
              ...(c && f.status ? { status: f.status as "active" | "paused" | "ended" } : {}),
              budget,
            }),
          );
        }}
      >
        <label className="c-lbl">
          Tên chiến dịch
          <input className={FIELD} value={f.name} onChange={set("name")} required maxLength={200} />
        </label>
        <label className="c-lbl">
          Nền tảng
          <select className={FIELD} value={f.platform} onChange={set("platform")}>
            {Object.entries(PLATFORMS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="c-lbl">
          Mã chiến dịch trên nền tảng (để gắn lead)
          <input
            className={FIELD}
            value={f.externalId}
            onChange={set("externalId")}
            placeholder="Ví dụ 120210000000001"
          />
        </label>
        <label className="c-lbl">
          Thị trường khách
          <select className={FIELD} value={f.market} onChange={set("market")}>
            <option value="">Mọi thị trường</option>
            {markets.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="c-lbl">
          Bắt đầu
          <input type="date" className={FIELD} value={f.startsOn} onChange={set("startsOn")} />
        </label>
        <label className="c-lbl">
          Kết thúc
          <input type="date" className={FIELD} value={f.endsOn} onChange={set("endsOn")} />
        </label>
        {c ? (
          <label className="c-lbl">
            Trạng thái
            <select className={FIELD} value={f.status} onChange={set("status")}>
              {f.status ? null : <option value="">{CAMPAIGN_STATUS[c.status]?.label ?? c.status}</option>}
              <option value="active">Đang chạy</option>
              <option value="paused">Tạm dừng</option>
              <option value="ended">Đã kết thúc</option>
            </select>
          </label>
        ) : (
          <label className="c-lbl">
            {canApprove ? "Ngân sách" : "Ngân sách xin duyệt"}
            <input className={FIELD} value={f.budget} onChange={set("budget")} placeholder="Ví dụ 30tr" />
          </label>
        )}
        <label className="c-lbl sm:col-span-2">
          Ghi chú
          <input className={FIELD} value={f.note} onChange={set("note")} maxLength={1000} />
        </label>
        <div className="flex gap-1.5 sm:col-span-2">
          <button type="submit" className="c-btn is-brand" disabled={pending}>
            {c ? "Lưu chiến dịch" : "Tạo chiến dịch"}
          </button>
          <button type="button" className="c-btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      </form>
    </section>
  );
}

function SpendImport({ importCsv }: { importCsv: CampaignActions["importCsv"] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);

  return (
    <section className="c-card" aria-label="Nhập chi phí từ file">
      <div className="c-ch">
        <h2>Nhập chi phí từ file CSV</h2>
        <span className="c-r c-lbl">Cột: Ngày, Chiến dịch (mã hoặc tên), Số tiền</span>
      </div>
      <div className="c-cb">
        <label className="c-btn inline-flex cursor-pointer items-center gap-1.5">
          <Upload size={15} aria-hidden /> Chọn file CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="File chi phí CSV"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              start(async () => {
                const r = await importCsv({ text: await file.text() });
                toast(r.message, r.ok ? "ok" : "err");
                setErrors(r.errors ?? []);
                if (r.ok) router.refresh();
              });
            }}
          />
        </label>
        {errors.length ? (
          <ul className="m-0 mt-2 list-none space-y-1 p-0" aria-label="Dòng lỗi">
            {errors.slice(0, 20).map((e) => (
              <li key={e} className="text-err">
                {e}
              </li>
            ))}
            {errors.length > 20 ? <li className="c-lbl">Và {errors.length - 20} dòng lỗi khác.</li> : null}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
