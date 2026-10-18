"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatMoney } from "@/lib/format";
import { ORDER_STATUS_LIVE, ORDER_TONE } from "@/lib/sales/order-labels";

import { LocTag, PageHead } from "../parts";

// Danh sách đơn bản thật (route /orders): bố cục bám bản mô phỏng orders.tsx, dữ liệu do server page đọc dưới RLS.
// Tạo đơn đi từ hội thoại hoặc hồ sơ lead (đơn luôn gắn một lead đủ bốn thông tin).

export interface LiveOrderRow {
  id: string;
  code: string;
  status: string;
  buyer: string;
  buyerMarket: string;
  recipient: string | null;
  self: boolean;
  total: number;
  confirmed: number;
  pending: number;
  seller: string;
  createdAt: string;
}

const FILTERS: { key: string; label: string; statuses: string[] }[] = [
  { key: "approval", label: "Chờ duyệt", statuses: ["pending_approval"] },
  { key: "deposit", label: "Chờ cọc", statuses: ["confirmed"] },
  { key: "holding", label: "Đã cọc", statuses: ["deposit_paid"] },
  { key: "shipping", label: "Chờ giao, đang giao", statuses: ["ready_to_ship", "delivering", "installed"] },
  { key: "done", label: "Hoàn tất", statuses: ["completed"] },
  { key: "cancelled", label: "Đã hủy", statuses: ["cancelled"] },
];

export function OrdersLive({ rows, allOrders }: { rows: LiveOrderRow[]; allOrders: boolean }) {
  const [f, setF] = useState<string | null>(null);
  const filter = FILTERS.find((x) => x.key === f);
  const shown = rows.filter((o) => !filter || filter.statuses.includes(o.status));
  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={ShoppingCart}
          color="var(--obj-lead)"
          kicker="Đơn hàng"
          title={allOrders ? "Đơn hàng" : "Đơn của tôi"}
        >
          <span className="c-lbl">{shown.length} đơn, mới nhất trước</span>
          <Link href="/inbox" className="c-btn is-blue">
            Lên đơn từ hội thoại
          </Link>
        </PageHead>
        <div className="c-ftabs mx-4" role="tablist" aria-label="Lọc đơn">
          <button type="button" role="tab" aria-selected={!f} className="c-ftab" onClick={() => setF(null)}>
            Tất cả
          </button>
          {FILTERS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={f === x.key}
              className="c-ftab"
              onClick={() => setF(x.key)}
            >
              {x.label} ({rows.filter((o) => x.statuses.includes(o.status)).length})
            </button>
          ))}
        </div>
      </section>
      <section className="c-card">
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Người đặt</th>
                <th>Người nhận</th>
                <th className="text-right">Tổng</th>
                <th className="text-right">Đã xác nhận</th>
                <th className="text-right">Còn lại</th>
                <th>Trạng thái</th>
                <th>Người bán</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const st = ORDER_STATUS_LIVE[o.status] ?? { label: o.status, tone: "neutral" as const };
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.id}`} className="c-link font-semibold tabular">
                        {o.code}
                      </Link>
                    </td>
                    <td>
                      {o.buyer}{" "}
                      {o.buyerMarket === "KR" || o.buyerMarket === "VN" ? (
                        <LocTag loc={o.buyerMarket} />
                      ) : null}
                      {o.pending ? (
                        <span className="c-lbl block text-warn">{formatMoney(o.pending)} chờ xác nhận</span>
                      ) : null}
                    </td>
                    <td>
                      {o.self ? (
                        <span className="c-lbl">Chính khách</span>
                      ) : (
                        o.recipient || <span className="text-warn">Chưa xác nhận</span>
                      )}
                    </td>
                    <td className="text-right tabular">{formatMoney(o.total)}</td>
                    <td className="text-right tabular">{formatMoney(o.confirmed)}</td>
                    <td className="text-right tabular">{formatMoney(Math.max(0, o.total - o.confirmed))}</td>
                    <td>
                      <span className={`c-pill ${ORDER_TONE[st.tone]}`}>{st.label}</span>
                    </td>
                    <td>{o.seller}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {shown.length === 0 ? (
          <p className="c-empty">
            {rows.length
              ? "Nhóm này chưa có đơn. Chọn Tất cả để xem mọi đơn."
              : "Chưa có đơn nào. Lên đơn ở tab Lên đơn trong Hội thoại."}
          </p>
        ) : null}
      </section>
    </div>
  );
}
