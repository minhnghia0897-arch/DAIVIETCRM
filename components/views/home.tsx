import { LayoutDashboard } from "lucide-react";
import Link from "next/link";

import { MarketTag, type MarketInfo } from "@/components/market-tag";

// Trang chủ bản thật theo phong cách Telegram (07/10/2026, .tgx trong crm.css): nền xám nhạt, thẻ trắng bo tròn,
// tiêu đề mục chữ xanh, ô số liệu nền xám, dòng lead có avatar tròn. Bố cục giữ như trước: số liệu, rồi hàng chờ.

export interface HomeLeadRow {
  id: string;
  stage: string;
  slaDueAt: string | null;
  firstContactAt: string | null;
  assignedTo: string | null;
  contactName: string;
  market: string;
  assigneeName: string | null;
}

const STAGE_LABEL: Record<string, string> = {
  new: "Mới",
  contacted: "Đã liên hệ",
  demo: "Demo, video call",
  quoted: "Báo giá",
  deposit: "Đặt cọc",
  won: "Thành công",
  lost: "Thất bại",
};

const PALETTE = ["#e17076", "#7bc862", "#65aadd", "#a695e7", "#ee7aae", "#6ec9cb", "#faa774"];
const colorOf = (name: string) =>
  PALETTE[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % PALETTE.length];
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

export function HomeView({
  teamView,
  rows,
  markets,
  now,
}: {
  teamView: boolean;
  rows: HomeLeadRow[];
  markets: MarketInfo[];
  now: Date;
}) {
  const isOverdue = (l: HomeLeadRow) =>
    !l.firstContactAt && l.slaDueAt !== null && Date.parse(l.slaDueAt) < now.getTime();
  const overdue = rows.filter(isOverdue).length;
  const unassigned = rows.filter((l) => !l.assignedTo).length;
  const fresh = rows.filter((l) => l.stage === "new").length;

  return (
    <div className="tgx c-stack mx-auto max-w-6xl">
      <section className="c-card">
        <div className="c-phd px-4 pt-3">
          <span
            className="c-oi is-lg"
            style={{ "--c": "var(--tgx-blue)" } as React.CSSProperties}
            aria-hidden
          >
            <LayoutDashboard />
          </span>
          <div className="c-t">
            <small>{teamView ? "Toàn showroom" : "Của tôi"}</small>
            <h1 className="m-0">
              <b>{teamView ? "Đội hôm nay" : "Việc của tôi hôm nay"}</b>
            </h1>
          </div>
        </div>
        <div className="c-kpis">
          <Metric label="Lead đang mở" value={rows.length} href="/leads" />
          <Metric label="Lead mới" value={fresh} href="/leads?stage=new" />
          <Metric
            label="Quá hạn"
            value={overdue}
            tone={overdue ? "err" : undefined}
            href="/leads?view=overdue"
          />
          {teamView ? (
            <Metric
              label="Chưa phân"
              value={unassigned}
              tone={unassigned ? "warn" : undefined}
              href="/leads?view=unassigned"
            />
          ) : null}
        </div>
      </section>

      <section className="c-card" aria-labelledby="home-queue">
        <div className="c-ch">
          <h2 id="home-queue">{teamView ? "Lead đang mở của showroom" : "Hàng chờ gọi"}</h2>
          <Link href="/leads" className="c-link ml-auto text-[13px]">
            Xem tất cả
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className="c-cb m-0 text-text-weak">
            Chưa có lead nào chờ gọi. Lead mới sẽ hiện ở đây ngay khi được giao cho anh chị.
          </p>
        ) : (
          <ul className="m-0 list-none px-2 pb-2">
            {rows.map((l) => (
              <li key={l.id}>
                <Link href={`/leads/${l.id}`} className="tgx-row">
                  <span
                    className="tg-av"
                    style={{ width: 40, height: 40, fontSize: 15, background: colorOf(l.contactName) }}
                    aria-hidden
                  >
                    {initials(l.contactName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <b>{l.contactName}</b>
                      <MarketTag code={l.market} markets={markets} />
                    </span>
                    <span className="c-lbl block">
                      {teamView
                        ? l.assigneeName
                          ? `Giao cho ${l.assigneeName}`
                          : "Chưa phân"
                        : "Đang chờ anh chị gọi"}
                    </span>
                  </span>
                  {isOverdue(l) ? <span className="c-pill is-err">Quá hạn</span> : null}
                  <span className="c-pill is-n">{STAGE_LABEL[l.stage] ?? l.stage}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number;
  tone?: "err" | "warn";
  href: string;
}) {
  return (
    <Link href={href} className="tgx-metric">
      <span className="c-lbl block">{label}</span>
      <b
        className={`tabular text-metric ${tone === "err" ? "text-err" : tone === "warn" ? "text-warn" : ""}`}
      >
        {value}
      </b>
    </Link>
  );
}
