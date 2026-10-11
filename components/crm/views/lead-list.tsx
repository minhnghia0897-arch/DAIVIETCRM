"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { MarketTag, type MarketInfo } from "@/components/market-tag";
import { useToast } from "@/components/ui/toast";
import { PROVINCES_ALL } from "@/lib/demo/sales-catalog";
import { LEAD_STAGE_LABEL } from "@/lib/leads/labels";
import { PageHead } from "../parts";
import { useShell } from "../shell-context";
import { LeadImport, type ImportActions } from "./lead-import";

// Danh sách lead bản thật (route /leads): dữ liệu do server page đọc từ database dưới RLS, thao tác gọi server action.
// Bố cục theo DESIGN.md 5.10: bộ lọc nhanh dạng pill giữ trên URL, chọn nhiều hàng thì hiện thanh giao hàng loạt.

export type LeadView = "mine" | "open" | "unassigned" | "overdue" | "waiting" | "closed";

export interface LeadListRow {
  id: string;
  name: string;
  market: string;
  /** Giờ hiện tại ở nơi khách sống (khách nước ngoài). */
  localTime: string | null;
  source: string;
  stage: string;
  sla: { tone: "n" | "warn" | "err" | "ok" | "ai"; text: string } | null;
  ownerName: string | null;
  phoneInvalid: boolean;
}

interface Assignee {
  id: string;
  name: string;
  receives: boolean;
  uncontacted: number;
}

type Result = { ok: boolean; message: string };

export interface LeadListActions extends ImportActions {
  createLead(i: {
    fullName: string;
    phone: string;
    country: string;
    sourceKey: string;
    productInterest?: string;
    recipientProvince?: string;
    note?: string;
    marketingConsent?: boolean;
  }): Promise<Result & { leadId?: string; canOpen?: boolean }>;
  assignLeads(i: {
    leadIds: string[];
    assigneeId: string | null;
    assigneeName?: string;
    reason?: string;
  }): Promise<Result>;
}

const SELECT = "rounded-control border border-line bg-surface px-1.5 py-1 text-text";
const FIELD = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";

export function LeadList(props: {
  view: LeadView;
  filters: { stage: string; market: string; source: string; q: string };
  rows: LeadListRow[];
  total: number;
  limit: number;
  teamView: boolean;
  counts: { unassigned: number; overdue: number; waiting: number; mine: number };
  markets: MarketInfo[];
  sources: { key: string; label: string }[];
  assignees: Assignee[];
  actions: LeadListActions;
}) {
  const { view, filters, rows, teamView, counts, markets, sources, assignees, actions } = props;
  const { can } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [panel, setPanel] = useState<"create" | "import" | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [assignee, setAssignee] = useState("");
  const [search, setSearch] = useState(filters.q);

  const canAssign = can("lead.assign") && assignees.length > 0;

  function hrefWith(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  const views: { key: LeadView; label: string; n?: number; show: boolean }[] = [
    { key: "mine", label: "Của tôi", n: counts.mine, show: true },
    { key: "open", label: "Đang mở", show: teamView },
    { key: "unassigned", label: "Chưa phân", n: counts.unassigned, show: teamView },
    { key: "overdue", label: "Quá hạn", n: counts.overdue, show: true },
    { key: "waiting", label: "Chờ khung gọi", n: counts.waiting, show: teamView },
    { key: "closed", label: "Đã đóng", show: true },
  ];

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function assign(to: string | null) {
    const a = assignees.find((x) => x.id === to);
    start(async () => {
      try {
        const r = await actions.assignLeads({
          leadIds: [...picked],
          assigneeId: to,
          assigneeName: a?.name,
        });
        toast(r.message, r.ok ? "ok" : "err");
        if (r.ok) {
          setPicked(new Set());
          router.refresh();
        }
      } catch {
        toast("Chưa giao được, thử lại sau ít phút.", "err");
      }
    });
  }

  const heading =
    view === "mine"
      ? "Lead của tôi"
      : view === "unassigned"
        ? "Lead chưa phân"
        : view === "overdue"
          ? "Lead quá hạn SLA"
          : view === "waiting"
            ? "Lead chờ khung gọi của khách"
            : view === "closed"
              ? "Lead đã đóng"
              : "Lead đang mở của showroom";

  return (
    <div className="c-stack c-flat">
      <section className="c-card">
        <PageHead
          icon={UserPlus}
          color="var(--obj-lead)"
          kicker={teamView ? "Toàn showroom" : "Của tôi"}
          title="Lead"
        >
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(hrefWith({ q: search.trim() || null }));
            }}
          >
            <input
              aria-label="Tìm theo tên khách"
              placeholder="Tìm theo tên khách"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={SELECT}
            />
          </form>
          {can("lead.import") ? (
            <button
              type="button"
              className="c-btn"
              onClick={() => setPanel((v) => (v === "import" ? null : "import"))}
            >
              Nhập file
            </button>
          ) : null}
          {can("lead.create") ? (
            <button
              type="button"
              className="c-btn is-blue"
              onClick={() => setPanel((v) => (v === "create" ? null : "create"))}
            >
              Tạo lead
            </button>
          ) : null}
        </PageHead>
        <div className="c-cb">
          <p className="c-lbl m-0">
            {props.total} lead
            {props.total > rows.length ? `, đang hiện ${rows.length} đầu tiên` : ""}
            {view === "closed" ? ", mới đóng trước" : ", sắp theo hạn SLA"}
          </p>
          <nav aria-label="Lọc nhanh" className="mt-2 flex flex-wrap items-center gap-1.5">
            {views
              .filter((v) => v.show)
              .map((v) => (
                <Link
                  key={v.key}
                  href={hrefWith({ view: v.key })}
                  aria-current={view === v.key ? "page" : undefined}
                  className={`c-pill ${view === v.key ? "is-info" : "is-n"}`}
                >
                  {v.label}
                  {v.n ? ` ${v.n}` : ""}
                </Link>
              ))}
            <select
              aria-label="Thị trường"
              value={filters.market}
              onChange={(e) => router.push(hrefWith({ market: e.target.value || null }))}
              className={SELECT}
            >
              <option value="">Mọi thị trường</option>
              {markets.map((m) => (
                <option key={m.country_code} value={m.country_code}>
                  {m.name}
                </option>
              ))}
              <option value="unknown">Chưa rõ nơi ở</option>
            </select>
            <select
              aria-label="Nguồn"
              value={filters.source}
              onChange={(e) => router.push(hrefWith({ source: e.target.value || null }))}
              className={`${SELECT} max-w-56`}
            >
              <option value="">Mọi nguồn</option>
              {sources.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Giai đoạn"
              value={filters.stage}
              onChange={(e) => router.push(hrefWith({ stage: e.target.value || null }))}
              className={SELECT}
            >
              <option value="">Mọi giai đoạn</option>
              {Object.entries(LEAD_STAGE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            {filters.q || filters.market || filters.source || filters.stage ? (
              <Link href={hrefWith({ q: null, market: null, source: null, stage: null })} className="c-link">
                Bỏ lọc
              </Link>
            ) : null}
          </nav>
        </div>
      </section>

      {panel === "create" ? (
        <QuickLeadForm
          markets={markets}
          sources={sources}
          create={actions.createLead}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === "import" ? (
        <LeadImport
          markets={markets.map((m) => m.country_code)}
          canAssign={can("lead.assign")}
          actions={actions}
          onClose={() => setPanel(null)}
        />
      ) : null}

      {canAssign && picked.size > 0 ? (
        <section className="c-card c-cb flex flex-wrap items-center gap-2" aria-label="Giao hàng loạt">
          <b>Đã chọn {picked.size} lead</b>
          <select
            aria-label="Giao cho"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className={SELECT}
          >
            <option value="">Chọn người nhận</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.receives ? ` · đang giữ ${a.uncontacted} lead chưa gọi` : " · không nhận lead tự động"}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="c-btn is-go"
            disabled={!assignee || pending}
            onClick={() => assign(assignee)}
          >
            {assignee ? `Giao cho ${assignees.find((a) => a.id === assignee)?.name}` : "Giao cho"}
          </button>
          <button type="button" className="c-btn" disabled={pending} onClick={() => assign(null)}>
            Trả về Chưa phân
          </button>
          <button type="button" className="c-btn is-ghost" onClick={() => setPicked(new Set())}>
            Bỏ chọn
          </button>
        </section>
      ) : null}

      <section className="c-card" aria-label={heading}>
        {rows.length === 0 ? (
          <p className="c-empty">
            {view === "mine"
              ? "Chưa có lead nào được giao cho anh chị. Lead mới sẽ hiện ở đây ngay khi được giao."
              : view === "unassigned"
                ? "Không còn lead nào chưa phân."
                : view === "overdue"
                  ? "Không có lead nào quá hạn SLA."
                  : "Không có lead nào khớp bộ lọc."}
          </p>
        ) : (
          <>
            {/* Màn hẹp: thẻ hai dòng (tên + thị trường, rồi giai đoạn + SLA), DESIGN.md 5.10. */}
            <ul className="sm:hidden">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-start gap-2 border-b border-line-2 px-[14px] py-2 last:border-0"
                >
                  {canAssign ? (
                    <input
                      type="checkbox"
                      aria-label={`Chọn ${r.name}`}
                      checked={picked.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="mt-1"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/leads/${r.id}`} className="font-semibold hover:underline">
                        {r.name}
                      </Link>
                      <MarketTag code={r.market} markets={markets} />
                      {r.localTime ? <span className="c-lbl tabular">{r.localTime}</span> : null}
                    </div>
                    <div className="c-lbl mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{r.stage}</span>
                      {r.sla ? <span className={`c-pill is-${r.sla.tone}`}>{r.sla.text}</span> : null}
                      {r.phoneInvalid ? <span className="c-pill is-warn">Số chưa hợp lệ</span> : null}
                      <span>· {r.ownerName ?? "Chưa phân"}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="c-tw hidden sm:block">
              <table className="c-table">
                <thead>
                  <tr>
                    {canAssign ? (
                      <th className="w-8">
                        <input
                          type="checkbox"
                          aria-label="Chọn tất cả"
                          checked={picked.size === rows.length}
                          onChange={(e) =>
                            setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                          }
                        />
                      </th>
                    ) : null}
                    <th>Tên</th>
                    <th>Ở</th>
                    <th>Giờ khách</th>
                    <th>Nguồn</th>
                    <th>Giai đoạn</th>
                    <th>SLA</th>
                    <th>Giao</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      {canAssign ? (
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Chọn ${r.name}`}
                            checked={picked.has(r.id)}
                            onChange={() => toggle(r.id)}
                          />
                        </td>
                      ) : null}
                      <td>
                        <Link href={`/leads/${r.id}`} className="font-semibold hover:underline">
                          {r.name}
                        </Link>
                        {r.phoneInvalid ? (
                          <span className="c-pill is-warn ml-1.5">Số chưa hợp lệ</span>
                        ) : null}
                      </td>
                      <td>
                        <MarketTag code={r.market} markets={markets} />
                      </td>
                      <td className="tabular">{r.localTime ?? ""}</td>
                      <td>{r.source}</td>
                      <td>{r.stage}</td>
                      <td>
                        {r.sla ? <span className={`c-pill is-${r.sla.tone}`}>{r.sla.text}</span> : null}
                      </td>
                      <td>{r.ownerName ?? <span className="c-weak">Chưa phân</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** Nhập nhanh lead tay: khách đến showroom, gọi hotline, bình luận live, giới thiệu (CLAUDE.md mục 6). */
function QuickLeadForm({
  markets,
  sources,
  create,
  onClose,
}: {
  markets: MarketInfo[];
  sources: { key: string; label: string }[];
  create: LeadListActions["createLead"];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const empty = {
    fullName: "",
    phone: "",
    country: "unknown",
    sourceKey: sources.some((s) => s.key === "walk_in") ? "walk_in" : (sources[0]?.key ?? ""),
    productInterest: "",
    recipientProvince: "",
    note: "",
    marketingConsent: false,
  };
  const [f, setF] = useState(empty);
  const [last, setLast] = useState<{ id: string; text: string } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <form
      className="c-card c-cb"
      aria-label="Tạo lead"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await create({
              ...f,
              productInterest: f.productInterest || undefined,
              recipientProvince: f.recipientProvince || undefined,
              note: f.note || undefined,
            });
            toast(r.message, r.ok ? "ok" : "err");
            if (r.ok) {
              setLast(
                r.leadId && r.canOpen ? { id: r.leadId, text: r.message } : { id: "", text: r.message },
              );
              setF({ ...empty, sourceKey: f.sourceKey, country: f.country });
              router.refresh();
            }
          } catch {
            toast("Chưa lưu được lead, thử lại sau ít phút.", "err");
          }
        });
      }}
    >
      <b>Tạo lead</b>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <label className="c-lbl">
          Họ tên
          <input
            required
            value={f.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="c-lbl">
          Số điện thoại
          <input
            required
            inputMode="tel"
            placeholder="0912 345 678 hoặc 010-1234-5678"
            value={f.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="c-lbl">
          Khách đang sống ở
          <select value={f.country} onChange={(e) => set("country", e.target.value)} className={FIELD}>
            <option value="unknown">Chưa rõ (suy từ đầu số)</option>
            {markets.map((m) => (
              <option key={m.country_code} value={m.country_code}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="c-lbl">
          Nguồn
          <select
            required
            value={f.sourceKey}
            onChange={(e) => set("sourceKey", e.target.value)}
            className={FIELD}
          >
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="c-lbl">
          Sản phẩm quan tâm
          <input
            placeholder="Ví dụ: ghế DV-X9"
            value={f.productInterest}
            onChange={(e) => set("productInterest", e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="c-lbl">
          Tỉnh người nhận
          <select
            value={f.recipientProvince}
            onChange={(e) => set("recipientProvince", e.target.value)}
            className={FIELD}
          >
            <option value="">Chưa rõ</option>
            {PROVINCES_ALL.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="c-lbl sm:col-span-3">
          Ghi chú
          <input value={f.note} onChange={(e) => set("note", e.target.value)} className={FIELD} />
        </label>
      </div>
      <label className="mt-2 inline-flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={f.marketingConsent}
          onChange={(e) => set("marketingConsent", e.target.checked)}
        />
        Khách đồng ý nhận tư vấn, ưu đãi qua điện thoại và Zalo
      </label>
      {last ? (
        <p role="status" className="mt-2 mb-0 rounded-control bg-ok-soft px-2.5 py-1.5 text-ok">
          {last.text}{" "}
          {last.id ? (
            <Link href={`/leads/${last.id}`} className="font-semibold underline">
              Mở hồ sơ
            </Link>
          ) : null}
        </p>
      ) : null}
      <div className="mt-3 flex gap-1.5">
        <button type="submit" className="c-btn is-go" disabled={pending}>
          Lưu lead
        </button>
        <button type="button" className="c-btn" onClick={onClose}>
          Đóng
        </button>
      </div>
    </form>
  );
}
