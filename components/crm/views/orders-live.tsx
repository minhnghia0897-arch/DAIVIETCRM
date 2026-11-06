"use client";

import { ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import { ORDER_STATUS_LIVE, ORDER_TONE } from "@/lib/sales/order-labels";

import { LocTag, PageHead } from "../parts";

// Danh sách đơn bản thật (route /orders): bố cục bám bản mô phỏng orders.tsx, dữ liệu do server page đọc dưới RLS.
// Tạo đơn đi từ hội thoại hoặc hồ sơ lead (đơn luôn gắn một lead đủ bốn thông tin). Cột Xóa chỉ hiện với người có
// quyền order.delete (Owner): đơn nhập sai, chạy thử được xóa kèm lý do (migration 20261105000100_order_delete.sql).

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

type Result = { ok: boolean; message: string };

export function OrdersLive({
  rows,
  allOrders,
  deleteOrder,
}: {
  rows: LiveOrderRow[];
  allOrders: boolean;
  /** Chỉ truyền khi người dùng có quyền order.delete. */
  deleteOrder?: (i: { orderId: string; reason: string }) => Promise<Result>;
}) {
  const [f, setF] = useState<string | null>(null);
  const [target, setTarget] = useState<LiveOrderRow | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const filter = FILTERS.find((x) => x.key === f);
  const shown = rows.filter((o) => !filter || filter.statuses.includes(o.status));
  const remove = () => {
    if (!deleteOrder || !target || !reason.trim()) return;
    const order = target;
    start(async () => {
      let r: Result;
      try {
        r = await deleteOrder({ orderId: order.id, reason: reason.trim() });
      } catch {
        r = { ok: false, message: "Chưa xóa được, mạng chập chờn. Thử lại sau ít phút." };
      }
      toast(r.ok ? `Đã xóa đơn ${order.code}` : r.message, r.ok ? "ok" : "err");
      if (r.ok) {
        setTarget(null);
        setReason("");
        router.refresh();
      }
    });
  };
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
                {deleteOrder ? <th aria-label="Xóa đơn" /> : null}
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
                    {deleteOrder ? (
                      <td className="text-right">
                        <button
                          type="button"
                          className="c-btn"
                          style={{ color: "var(--err)" }}
                          aria-label={`Xóa đơn ${o.code}`}
                          title="Xóa đơn"
                          disabled={pending}
                          onClick={() => {
                            setReason("");
                            setTarget(o);
                          }}
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </td>
                    ) : null}
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
      {deleteOrder ? (
        <ConfirmDialog
          open={target !== null}
          onOpenChange={(open) => {
            if (!open) setTarget(null);
          }}
          title={`Xóa đơn ${target?.code ?? ""}?`}
          description="Đơn biến mất khỏi danh sách đơn, doanh số, số lượng bán và hồ sơ khách; việc đang mở của đơn bị hủy, phiếu bảo hành bị vô hiệu. Không khôi phục trên màn hình được. Đơn khách thật đổi ý thì dùng Hủy đơn trong hồ sơ đơn."
          confirmLabel="Xóa đơn"
          danger
          confirmDisabled={!reason.trim() || pending}
          onConfirm={remove}
        >
          <label className="c-lbl block">
            Lý do xóa (bắt buộc)
            <input
              aria-label="Lý do xóa"
              placeholder="Ví dụ: đơn chạy thử, nhập trùng"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 block w-full rounded-control border border-line bg-surface px-2 py-1.5"
            />
          </label>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
