"use client";

import { UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MarketTag, type MarketInfo } from "@/components/market-tag";
import { PersonChip } from "@/components/person-chip";
import { LIFECYCLE_STAGES, lifecycleOf, type LifecycleStage } from "@/lib/cdp/lifecycle";
import { formatDate } from "@/lib/format";
import { ORDER_TONE } from "@/lib/sales/order-labels";

import { PageHead } from "../parts";

// Danh sách khách bản thật (route /customers): dữ liệu do server page đọc từ view customer_list dưới RLS. Bộ lọc giai
// đoạn vòng đời và thị trường nằm trên URL để chia sẻ được (DESIGN.md 5.10).

export interface CustomerRow {
  id: string;
  name: string;
  relation: string | null;
  market: string;
  province: string | null;
  stage: string;
  lastInteraction: string | null;
  owned: string[];
  openTasks: number;
  ownerName: string | null;
}

const SELECT = "rounded-control border border-line bg-surface px-1.5 py-1 text-text";

export function CustomersLive({
  rows,
  total,
  counts,
  markets,
  filters,
  allCustomers,
}: {
  rows: CustomerRow[];
  total: number;
  counts: Record<LifecycleStage, number>;
  markets: MarketInfo[];
  filters: { stage: LifecycleStage | null; market: string; q: string };
  allCustomers: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(filters.q);
  const all = LIFECYCLE_STAGES.reduce((s, k) => s + (counts[k] ?? 0), 0);

  function hrefWith(patch: Record<string, string | null>) {
    const p = new URLSearchParams();
    const next = { stage: filters.stage, market: filters.market || null, q: filters.q || null, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/customers?${s}` : "/customers";
  }

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={UserRound}
          color="var(--obj-contact)"
          kicker="Khách"
          title={allCustomers ? "Khách của showroom" : "Khách của tôi"}
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
        </PageHead>
        <div className="c-cb">
          <p className="c-lbl m-0">
            {total} khách
            {total > rows.length ? `, đang hiện ${rows.length} đầu tiên` : ""}, sắp theo lần tương tác gần
            nhất. Giai đoạn tính tự động từ lead, đơn, bảo hành và đồng ý.
          </p>
          <nav aria-label="Lọc theo giai đoạn" className="mt-2 flex flex-wrap items-center gap-1.5">
            <Link
              href={hrefWith({ stage: null })}
              aria-current={!filters.stage ? "page" : undefined}
              className={`c-pill ${!filters.stage ? "is-info" : "is-n"}`}
            >
              Tất cả {all}
            </Link>
            {LIFECYCLE_STAGES.filter((s) => counts[s] || filters.stage === s).map((s) => (
              <Link
                key={s}
                href={hrefWith({ stage: s })}
                aria-current={filters.stage === s ? "page" : undefined}
                className={`c-pill ${filters.stage === s ? "is-info" : "is-n"}`}
                title={lifecycleOf(s).hint}
              >
                {lifecycleOf(s).label} {counts[s]}
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
                  Khách ở {m.name}
                </option>
              ))}
              <option value="unknown">Chưa rõ nơi ở</option>
            </select>
            {filters.q || filters.market || filters.stage ? (
              <Link href="/customers" className="c-link">
                Bỏ lọc
              </Link>
            ) : null}
          </nav>
        </div>
      </section>
      <section className="c-card">
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Ở</th>
                <th>Giai đoạn</th>
                <th>Đang dùng</th>
                <th>Tương tác gần nhất</th>
                <th>Phụ trách</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const lc = lifecycleOf(c.stage);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/customers/${c.id}`} className="c-link font-semibold">
                        {c.name}
                      </Link>
                      {c.relation ? <span className="c-lbl ml-2">{c.relation}</span> : null}
                      {c.openTasks ? <span className="c-lbl block">{c.openTasks} việc đang mở</span> : null}
                    </td>
                    <td>
                      <MarketTag code={c.market} markets={markets} />
                      {c.province ? <span className="c-lbl ml-1">{c.province}</span> : null}
                    </td>
                    <td>
                      <span className={`c-pill ${ORDER_TONE[lc.tone]}`} title={lc.hint}>
                        {lc.label}
                      </span>
                    </td>
                    <td>{c.owned.join(", ") || <span className="c-lbl">—</span>}</td>
                    <td className="tabular">{c.lastInteraction ? formatDate(c.lastInteraction) : "—"}</td>
                    <td>
                      <PersonChip name={c.ownerName ?? ""} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="c-empty">
            {filters.q || filters.market || filters.stage
              ? "Không có khách khớp bộ lọc. Bấm Bỏ lọc để xem mọi khách."
              : allCustomers
                ? "Chưa có khách nào. Khách có ngay khi có lead, tin nhắn hoặc đơn hàng."
                : "Chưa có khách nào thuộc lead hoặc đơn của anh chị."}
          </p>
        ) : null}
      </section>
    </div>
  );
}
