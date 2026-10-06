import Link from "next/link";

import { MarketTag, type MarketInfo } from "@/components/market-tag";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";

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
  const overdue = rows.filter(
    (l) => !l.firstContactAt && l.slaDueAt && Date.parse(l.slaDueAt) < now.getTime(),
  ).length;
  const unassigned = rows.filter((l) => !l.assignedTo).length;
  const fresh = rows.filter((l) => l.stage === "new").length;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{teamView ? "Đội hôm nay" : "Việc của tôi hôm nay"}</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Lead đang mở" value={rows.length} />
          <Metric label="Lead mới" value={fresh} />
          <Metric label="Quá hạn" value={overdue} tone={overdue ? "err" : undefined} />
          {teamView ? (
            <Metric label="Chưa phân" value={unassigned} tone={unassigned ? "warn" : undefined} />
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{teamView ? "Lead đang mở của showroom" : "Hàng chờ gọi"}</CardTitle>
        </CardHeader>
        {rows.length === 0 ? (
          <CardBody className="text-text-weak">
            Chưa có lead nào chờ gọi. Lead mới sẽ hiện ở đây ngay khi được giao cho anh chị.
          </CardBody>
        ) : (
          <ul>
            {rows.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-2 px-[14px] py-2 last:border-0"
              >
                <Link href={`/leads/${l.id}`} className="font-semibold hover:underline">
                  {l.contactName}
                </Link>
                <MarketTag code={l.market} markets={markets} />
                <Pill>{STAGE_LABEL[l.stage] ?? l.stage}</Pill>
                {teamView ? (
                  <span className="text-label text-text-weak">
                    {l.assigneeName ? `Giao cho ${l.assigneeName}` : "Chưa phân"}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "err" | "warn" }) {
  return (
    <div>
      <p className="text-label text-text-weak">{label}</p>
      <p
        className={`tabular text-metric font-extrabold ${tone === "err" ? "text-err" : tone === "warn" ? "text-warn" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
