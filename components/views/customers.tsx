import { PersonChip } from "@/components/person-chip";
import Link from "next/link";

import { MarketTag } from "@/components/market-tag";
import { ListHeader } from "@/components/record";
import { Pill } from "@/components/ui/pill";
import type { SessionUser } from "@/lib/auth/types";

import type { Lifecycle } from "@/lib/demo/data";
import { LIFECYCLE, MARKETS } from "@/lib/demo/labels";
import { getCustomer, staffName, visibleCustomers } from "@/lib/demo/repo";
import { formatDate } from "@/lib/format";

type SearchParams = Record<string, string | string[] | undefined>;

const STAGES: (Lifecycle | "all")[] = [
  "all",
  "lead",
  "new_customer",
  "active_owner",
  "loyal",
  "dormant",
  "at_risk",
];

export function CustomersView({ user, searchParams }: { user: SessionUser; searchParams: SearchParams }) {
  const { stage: rawStage, market } = searchParams;
  const stage = (typeof rawStage === "string" ? rawStage : "all") as Lifecycle | "all";
  const all = visibleCustomers(user);
  const rows = all.filter(
    (c) => (stage === "all" || c.lifecycle === stage) && (typeof market !== "string" || c.market === market),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <section className="ui-card overflow-hidden bg-surface pb-2">
        <ListHeader
          kind="contact"
          title={user.permissions.has("lead.view_all") ? "Khách của showroom" : "Khách của tôi"}
          summary={`${rows.length} khách, sắp theo lần tương tác gần nhất`}
          demo
          filters={[
            ...STAGES.map((s) => ({
              href: s === "all" ? "/customers" : `/customers?stage=${s}`,
              label: s === "all" ? "Tất cả" : LIFECYCLE[s].label,
              active: stage === s && typeof market !== "string",
            })),
            { href: "/customers?market=KR", label: "Khách ở Hàn Quốc", active: market === "KR" },
          ]}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead className="sticky top-0 border-b border-line bg-surface text-left text-label text-text-weak">
              <tr>
                <th className="px-[14px] py-2 font-semibold">Tên</th>
                <th className="px-3 py-2 font-semibold">Ở</th>
                <th className="px-3 py-2 font-semibold">Giai đoạn</th>
                <th className="px-3 py-2 font-semibold">Đang dùng</th>
                <th className="px-3 py-2 font-semibold">Tương tác gần nhất</th>
                <th className="px-3 py-2 font-semibold">Phụ trách</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .sort((a, b) => b.lastInteraction.localeCompare(a.lastInteraction))
                .map((c) => {
                  const owned = getCustomer(user, c.id)?.owned ?? [];
                  return (
                    <tr key={c.id} className="h-10 border-t border-line-2 hover:bg-surface-2">
                      <td className="px-[14px] py-1">
                        <Link href={`/customers/${c.id}`} className="font-bold text-text hover:underline">
                          {c.fullName}
                        </Link>
                        {c.relation ? (
                          <span className="ml-2 text-label text-text-weak">{c.relation}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-1">
                        <MarketTag code={c.market} markets={MARKETS} />
                      </td>
                      <td className="px-3 py-1">
                        <Pill tone={LIFECYCLE[c.lifecycle].tone}>{LIFECYCLE[c.lifecycle].label}</Pill>
                      </td>
                      <td className="px-3 py-1">{owned.map((o) => o.name).join(", ") || "—"}</td>
                      <td className="tabular px-3 py-1">{formatDate(c.lastInteraction)}</td>
                      <td className="px-3 py-1">
                        <PersonChip name={staffName(c.ownerId)} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="px-[14px] py-3 text-text-weak">
              Nhóm này chưa có khách. Chọn Tất cả để xem mọi khách.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
