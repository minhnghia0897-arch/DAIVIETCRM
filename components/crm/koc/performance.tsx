"use client";

import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CHANNEL_STATS } from "@/lib/demo/crm-data";
import { formatMoneyShort } from "@/lib/format";
import { KOC_TODAY } from "@/lib/koc/data";
import { KIND_LABEL, creatorStats, formatFollowers, formatRoas } from "@/lib/koc/logic";

import { PageHead } from "../parts";
import { useKoc } from "./provider";

// Hiệu quả KOL, KOC: chi phí (phí booking cộng hoa hồng), lượt xem, lead và đơn có mã giới thiệu, doanh thu, chi
// phí mỗi lead, mỗi đơn, doanh thu trên chi phí; so với các kênh khác để quyết dồn ngân sách.

const PERIODS = [
  { key: "30", label: "30 ngày qua", days: 30 },
  { key: "90", label: "90 ngày qua", days: 90 },
  { key: "all", label: "Từ đầu", days: null },
] as const;

const money = (v: number | null) => (v === null ? "Chưa có" : formatMoneyShort(v));

export function KocPerformance() {
  const { data } = useKoc();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("90");
  const days = PERIODS.find((p) => p.key === period)!.days;
  const since = days
    ? new Date(Date.parse(`${KOC_TODAY}T00:00:00+07:00`) - days * 86_400_000).toISOString().slice(0, 10)
    : undefined;
  const rows = data.creators
    .map((c) => ({ c, s: creatorStats(data, c.id, since) }))
    .filter((r) => r.s.bookings || r.s.leads)
    .sort((a, b) => (b.s.roas ?? -1) - (a.s.roas ?? -1));
  const t = creatorStats(data, null, since);

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead icon={BarChart3} color="var(--obj-lead)" kicker="KOL, KOC" title="Hiệu quả" />
        <div className="c-cb flex flex-wrap gap-1.5" role="group" aria-label="Khoảng thời gian">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              className={`c-pill ${period === p.key ? "is-info" : "is-n"}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="c-kpis">
          <div>
            <span className="c-lbl">Chi phí</span>
            <strong>{formatMoneyShort(t.cost)}</strong>
          </div>
          <div>
            <span className="c-lbl">Lead có mã</span>
            <strong>{t.leads}</strong>
          </div>
          <div>
            <span className="c-lbl">Chi phí mỗi đơn</span>
            <strong>{money(t.cpo)}</strong>
          </div>
          <div>
            <span className="c-lbl">Doanh thu trên chi phí</span>
            <strong>{formatRoas(t.roas)}</strong>
          </div>
        </div>
      </section>

      <section className="c-card" aria-label="Hiệu quả từng người">
        <div className="c-ch">
          <h2>Từng người</h2>
          <span className="c-lbl ml-auto">Xếp theo hoàn vốn (doanh thu trên chi phí)</span>
        </div>
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Tên</th>
                <th className="text-right">Chi phí</th>
                <th className="text-right">Lượt xem</th>
                <th className="text-right">Lead</th>
                <th className="text-right">Đã cọc</th>
                <th className="text-right">Đơn</th>
                <th className="text-right">Doanh thu</th>
                <th className="text-right">Mỗi lead</th>
                <th className="text-right">Mỗi đơn</th>
                <th className="text-right">Hoàn vốn</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, s }) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/kol/${c.id}`} className="c-link font-semibold">
                      {c.name}
                    </Link>
                    <span className="c-lbl block">{KIND_LABEL[c.kind]}</span>
                  </td>
                  <td className="text-right tabular">{formatMoneyShort(s.cost)}</td>
                  <td className="text-right tabular">{s.views ? formatFollowers(s.views) : "0"}</td>
                  <td className="text-right tabular">{s.leads}</td>
                  <td className="text-right tabular">{s.deposits}</td>
                  <td className="text-right tabular">{s.orders}</td>
                  <td className="text-right tabular">{s.revenue ? formatMoneyShort(s.revenue) : "0"}</td>
                  <td className="text-right tabular">{money(s.cpl)}</td>
                  <td className="text-right tabular">{money(s.cpo)}</td>
                  <td className="text-right tabular">
                    <b>{formatRoas(s.roas)}</b>
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <b>Tổng</b>
                </td>
                <td className="text-right tabular">{formatMoneyShort(t.cost)}</td>
                <td className="text-right tabular">{formatFollowers(t.views)}</td>
                <td className="text-right tabular">{t.leads}</td>
                <td className="text-right tabular">{t.deposits}</td>
                <td className="text-right tabular">{t.orders}</td>
                <td className="text-right tabular">{formatMoneyShort(t.revenue)}</td>
                <td className="text-right tabular">{money(t.cpl)}</td>
                <td className="text-right tabular">{money(t.cpo)}</td>
                <td className="text-right tabular">
                  <b>{formatRoas(t.roas)}</b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="c-lbl mx-4 mb-3 mt-2">
          Lead tính khi khách nhắc mã giới thiệu, điền mã vào form hoặc bấm link có mã. Doanh thu, hoa hồng
          chỉ tính đơn đã hoàn tất. Khách xem bài mà không nhắc mã thì không được tính, nên số thật thường cao
          hơn.
        </p>
      </section>

      <section className="c-card" aria-label="So với kênh khác">
        <div className="c-ch">
          <h2>So với kênh khác, quý này</h2>
        </div>
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Kênh</th>
                <th className="text-right">Chi phí mỗi đơn</th>
                <th className="text-right">Hoàn vốn</th>
              </tr>
            </thead>
            <tbody>
              {CHANNEL_STATS.filter(([, , cost]) => cost > 0).map(([name, , cost, orders, rev]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="text-right tabular">{formatMoneyShort((cost * 1_000_000) / orders)}</td>
                  <td className="text-right tabular">{formatRoas(rev / cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
