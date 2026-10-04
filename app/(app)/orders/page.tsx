import type { Metadata } from "next";
import Link from "next/link";

import { MarketTag } from "@/components/market-tag";
import { ListHeader } from "@/components/record";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { requireAnyPermission } from "@/lib/auth/session";
import { CUSTOMERS, type OrderStatus } from "@/lib/demo/data";
import { MARKETS, ORDER_STATUS } from "@/lib/demo/labels";
import { orderTotals, staffName, visibleOrders } from "@/lib/demo/repo";
import { formatDate, formatMoneyShort } from "@/lib/format";

export const metadata: Metadata = { title: "Đơn hàng · Đại Việt CRM" };

const FILTERS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "approval", label: "Chờ duyệt", statuses: ["pending_approval"] },
  { key: "deposit", label: "Chờ cọc", statuses: ["confirmed"] },
  { key: "holding", label: "Đang giữ hàng", statuses: ["deposit_paid"] },
  { key: "shipping", label: "Chờ giao, đang giao", statuses: ["ready_to_ship", "delivering", "installed"] },
  { key: "done", label: "Hoàn tất", statuses: ["completed"] },
];

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const user = await requireAnyPermission(["order.view_own", "order.view_all"]);
  const { f } = await searchParams;
  const filter = FILTERS.find((x) => x.key === f);
  const all = visibleOrders(user);
  const rows = all
    .filter((o) => !filter || filter.statuses.includes(o.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const person = (id: string) => CUSTOMERS.find((c) => c.id === id)!;

  return (
    <main className="mx-auto max-w-7xl px-4 py-4">
      <Card>
        <ListHeader
          kind="order"
          title={user.permissions.has("order.view_all") ? "Đơn hàng" : "Đơn của tôi"}
          summary={`${rows.length} đơn, mới nhất trước`}
          demo
          filters={[
            { href: "/orders", label: "Tất cả", active: !filter },
            ...FILTERS.map((x) => ({
              href: `/orders?f=${x.key}`,
              label: x.label,
              active: filter?.key === x.key,
            })),
          ]}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse">
            <thead className="sticky top-0 bg-surface-2 text-left">
              <tr>
                <th className="px-[14px] py-2 font-semibold">Mã đơn</th>
                <th className="px-3 py-2 font-semibold">Người đặt</th>
                <th className="px-3 py-2 font-semibold">Người nhận</th>
                <th className="px-3 py-2 text-right font-semibold">Tổng</th>
                <th className="px-3 py-2 text-right font-semibold">Đã trả</th>
                <th className="px-3 py-2 text-right font-semibold">Còn lại</th>
                <th className="px-3 py-2 font-semibold">Trạng thái</th>
                <th className="px-3 py-2 font-semibold">Người bán</th>
                <th className="px-3 py-2 font-semibold">Hẹn giao</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const t = orderTotals(o);
                const buyer = person(o.buyerId);
                const recipient = person(o.recipientId);
                return (
                  <tr key={o.id} className="h-10 border-t border-line-2 hover:bg-surface-2">
                    <td className="tabular px-[14px] py-1">
                      <Link href={`/orders/${o.id}`} className="font-semibold text-brand">
                        {o.code}
                      </Link>
                    </td>
                    <td className="px-3 py-1">
                      <span className="mr-1.5">{buyer.fullName}</span>
                      <MarketTag code={buyer.market} markets={MARKETS} />
                    </td>
                    <td className="px-3 py-1">
                      {o.recipientId === o.buyerId ? (
                        <span className="text-text-weak">Chính khách</span>
                      ) : (
                        <>
                          {recipient.fullName}
                          <span className="ml-1 text-label text-text-weak">{recipient.province}</span>
                        </>
                      )}
                    </td>
                    <td className="tabular px-3 py-1 text-right">{formatMoneyShort(t.total)}</td>
                    <td className="tabular px-3 py-1 text-right">{formatMoneyShort(t.confirmed)}</td>
                    <td className="tabular px-3 py-1 text-right">
                      {t.balance > 0 ? formatMoneyShort(t.balance) : "0"}
                    </td>
                    <td className="px-3 py-1">
                      <Pill tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Pill>
                    </td>
                    <td className="px-3 py-1">{staffName(o.sellerId)}</td>
                    <td className="tabular px-3 py-1">{o.deliveryDate ? formatDate(o.deliveryDate) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="px-[14px] py-3 text-text-weak">Chưa có đơn nào ở nhóm này.</p>
          ) : null}
        </div>
      </Card>
    </main>
  );
}
