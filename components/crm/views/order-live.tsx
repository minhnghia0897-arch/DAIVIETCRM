"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";
import {
  NEXT_LABEL_LIVE,
  NEXT_STATUS_LIVE,
  ORDER_PATH_LIVE,
  ORDER_STATUS_LIVE,
  ORDER_TONE,
  PAYMENT_METHOD_LABEL,
} from "@/lib/sales/order-labels";

import { LocTag, PageHead } from "../parts";

// Hồ sơ đơn bản thật (route /orders/[id]): bố cục bám bản mô phỏng CrmOrder (orders.tsx). Mọi điều kiện chuyển bước
// do database kiểm (order_blockers, advance_order); giao diện chỉ hiện lý do và gọi server action.

type Result = { ok: boolean; message: string };

export interface LiveOrderDetail {
  id: string;
  code: string;
  status: string;
  channel: string;
  seller: string;
  leadId: string | null;
  holdUntil: string | null;
  cancelReason: string | null;
  buyer: { id: string | null; name: string; market: string; phone: string | null };
  self: boolean;
  recipient: { name: string; relation: string | null } | null;
  address: string;
  keepSurprise: boolean;
  giftMessage: string | null;
  note: string | null;
  items: {
    id: string;
    sku: string;
    name: string;
    qty: number;
    lineTotal: number;
    isGift: boolean;
    trackSerial: boolean;
    serials: string[];
    suggest: string[];
  }[];
  money: {
    subtotal: number;
    discount: number;
    fees: number;
    total: number;
    confirmed: number;
    pending: number;
    depositMin: number;
    refundable: number;
    refunded: number;
  };
  payments: {
    id: string;
    type: string;
    method: string;
    amount: number;
    reference: string | null;
    status: string;
    by: string;
    at: string;
    proofUrl: string | null;
    note: string | null;
  }[];
  delivery: {
    scheduledOn: string | null;
    note: string;
    installedAt: string | null;
    handoverSent: boolean;
    stockIssued: boolean;
  };
  warranties: { code: string; product: string; serial: string | null; endsOn: string | null }[];
  warehouseId: string | null;
  warehouses: { id: string; name: string }[];
  reservedQty: number;
  /** Doanh số của đơn cho người bán: giá trị sẽ tính và các dòng đã ghi trong sổ doanh số. */
  sales: {
    value: number;
    credits: { kind: "sale" | "reversal"; amount: number; reason: string | null; month: string }[];
  };
  codApproved: boolean;
  backorderUntil: string | null;
  blockers: string[];
  perms: {
    edit: boolean;
    delivery: boolean;
    post: boolean;
    codApprove: boolean;
    backorder: boolean;
    cancel: boolean;
    record: boolean;
    refund: boolean;
  };
}

export interface OrderLiveActions {
  advanceOrder(orderId: string): Promise<Result>;
  approveCod(orderId: string): Promise<Result>;
  cancelOrder(i: { orderId: string; reason: string }): Promise<Result>;
  issueStock(i: { orderId: string; serials: Record<string, string[]> }): Promise<Result>;
  recordPayment(form: FormData): Promise<Result>;
  recordRefund(i: { orderId: string; amount: number; reference: string }): Promise<Result>;
  setBackorder(i: { orderId: string; expected: string }): Promise<Result>;
  setOrderWarehouse(i: { orderId: string; warehouseId: string }): Promise<Result>;
  updateDelivery(i: {
    orderId: string;
    scheduledOn: string | null;
    note: string;
    handover?: boolean;
  }): Promise<Result>;
}

const FIELD = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";
const dmy = (d: string) => d.split("-").reverse().join("/");

function useRun() {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { run, pending };
}

export function OrderLive({ data: o, actions }: { data: LiveOrderDetail; actions: OrderLiveActions }) {
  const { run, pending } = useRun();
  const st = ORDER_STATUS_LIVE[o.status] ?? { label: o.status, tone: "neutral" as const };
  const next = NEXT_STATUS_LIVE[o.status];
  const ended = ["completed", "cancelled", "returned"].includes(o.status);
  const deliveryStep = next === "delivering" || next === "installed" || next === "completed";
  const canAdvance = next && (deliveryStep ? o.perms.delivery : o.perms.edit);
  const cur = ORDER_PATH_LIVE.findIndex((p) => p.status === o.status);
  const m = o.money;
  const balance = m.total - m.confirmed;
  const stockShort = o.blockers.some((b) => b.startsWith("Không đủ hàng"));

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={ShoppingCart}
          color="var(--obj-lead)"
          kicker="Đơn hàng"
          title={`Đơn ${o.code}`}
          back={{ href: "/orders", label: "Đơn hàng" }}
        >
          <span className={`c-pill ${ORDER_TONE[st.tone]}`}>{st.label}</span>
        </PageHead>
        <div className="c-hl">
          <div>
            <span className="c-lbl">Kênh</span>
            <b>{o.channel}</b>
          </div>
          <div>
            <span className="c-lbl">Người bán</span>
            <b>{o.seller}</b>
          </div>
          <div>
            <span className="c-lbl">Tổng</span>
            <b className="tabular">{formatMoney(m.total)}</b>
          </div>
          <div>
            <span className="c-lbl">Còn phải thu</span>
            <b className="tabular">{formatMoney(Math.max(0, balance))}</b>
          </div>
          <div>
            <span className="c-lbl">Giữ hàng đến</span>
            <b>{o.holdUntil ?? "—"}</b>
          </div>
          {o.leadId ? (
            <div>
              <span className="c-lbl">Lead</span>
              <b>
                <Link href={`/leads/${o.leadId}`} className="c-link">
                  mở hồ sơ lead
                </Link>
              </b>
            </div>
          ) : null}
        </div>
      </section>

      {o.status === "cancelled" ? (
        <p className="c-card c-cb m-0 text-err" style={{ paddingTop: 12 }}>
          Đơn đã hủy{o.cancelReason ? `: ${o.cancelReason}` : ""}. Hàng đang giữ đã được nhả.
        </p>
      ) : o.status === "pending_approval" ? (
        <p className="c-card c-cb m-0 text-warn" style={{ paddingTop: 12 }}>
          Đơn giảm vượt giới hạn của người bán, đang chờ Owner duyệt ở Việc cần làm. Chưa giữ hàng.
        </p>
      ) : (
        <ol aria-label="Các bước đơn hàng" className="c-steps m-0 list-none p-0">
          {ORDER_PATH_LIVE.map((p, i) => (
            <li
              key={p.status}
              aria-current={i === cur ? "step" : undefined}
              className={i < cur ? "is-done" : i === cur ? "is-cur" : undefined}
            >
              {p.label}
            </li>
          ))}
        </ol>
      )}

      <div className="c-g84">
        <div className="c-stack">
          <section className="c-card" aria-label="Thao tác đơn">
            <div className="c-ch">
              <h2>Bước tiếp theo</h2>
            </div>
            <div className="c-cb space-y-2">
              {ended ? <p className="c-lbl m-0">Đơn đã kết thúc.</p> : null}
              {next && !ended && o.status !== "pending_approval" ? (
                <>
                  {o.blockers.length ? (
                    <ul className="m-0 list-none space-y-1 p-0" aria-label="Điều kiện chưa đạt">
                      {o.blockers.map((b) => (
                        <li key={b} className="rounded-control bg-warn-soft px-2.5 py-1.5 text-warn">
                          {b}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    {canAdvance ? (
                      <button
                        type="button"
                        className="c-btn is-brand"
                        disabled={o.blockers.length > 0 || pending}
                        onClick={() => run(() => actions.advanceOrder(o.id))}
                      >
                        {NEXT_LABEL_LIVE[next]}
                      </button>
                    ) : (
                      <span className="c-lbl">Anh chị chưa có quyền chuyển bước này.</span>
                    )}
                    {(o.status === "deposit_paid" || o.status === "confirmed") &&
                    !o.codApproved &&
                    o.perms.codApprove ? (
                      <button
                        type="button"
                        className="c-btn"
                        disabled={pending}
                        onClick={() => run(() => actions.approveCod(o.id))}
                      >
                        Duyệt thu khi giao
                      </button>
                    ) : null}
                    {o.codApproved ? <span className="c-pill is-ok">Được thu khi giao</span> : null}
                  </div>
                  {o.status === "ready_to_ship" && !o.delivery.stockIssued && o.perms.post ? (
                    <IssueStock order={o} actions={actions} />
                  ) : null}
                </>
              ) : null}
              {["confirmed", "draft", "pending_approval"].includes(o.status) &&
              o.perms.edit &&
              o.warehouses.length ? (
                <label className="c-lbl flex flex-wrap items-center gap-1.5">
                  Kho xuất
                  <select
                    aria-label="Kho xuất"
                    value={o.warehouseId ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      run(() => actions.setOrderWarehouse({ orderId: o.id, warehouseId: e.target.value }))
                    }
                    className="rounded-control border border-line bg-surface px-1.5 py-1 text-text"
                  >
                    {o.warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {o.status === "confirmed" && stockShort && o.perms.backorder && !o.backorderUntil ? (
                <Backorder orderId={o.id} actions={actions} />
              ) : null}
              {o.backorderUntil ? (
                <span className="c-pill is-warn">Đặt trước, dự kiến có hàng {dmy(o.backorderUntil)}</span>
              ) : null}
              {!ended && !o.delivery.stockIssued && o.perms.cancel ? (
                <CancelOrder orderId={o.id} actions={actions} />
              ) : null}
            </div>
          </section>

          <section className="c-card">
            <div className="c-ch">
              <h2>Người đặt và người nhận</h2>
            </div>
            <div className="c-cb">
              <div className="c-gift">
                <div>
                  <span className="c-lbl">Người đặt</span>
                  <b>
                    {o.buyer.name}{" "}
                    {o.buyer.market === "KR" || o.buyer.market === "VN" ? (
                      <LocTag loc={o.buyer.market} />
                    ) : null}
                  </b>
                  {o.buyer.phone ? <span className="c-lbl tabular">{o.buyer.phone}</span> : null}
                </div>
                <div>
                  <span className="c-lbl">Người nhận</span>
                  <b>
                    {o.self ? (
                      "Chính người đặt"
                    ) : o.recipient ? (
                      `${o.recipient.name}${o.recipient.relation ? ` (${o.recipient.relation})` : ""}`
                    ) : (
                      <span className="text-warn">Chưa xác nhận</span>
                    )}
                  </b>
                  <span className="c-lbl">{o.address}</span>
                </div>
              </div>
              {o.keepSurprise ? (
                <p className="m-0 rounded-control bg-warn-soft px-2.5 py-1.5 text-warn">
                  Giữ bất ngờ: không liên hệ người nhận khi người đặt chưa cho phép.
                </p>
              ) : null}
              {o.giftMessage ? <p className="mt-2 mb-0">Lời nhắn quà: {o.giftMessage}</p> : null}
              {o.note ? <p className="c-lbl mt-1 mb-0">Ghi chú: {o.note}</p> : null}
            </div>
          </section>

          <section className="c-card">
            <div className="c-ch">
              <h2>Sản phẩm</h2>
              {o.reservedQty ? <span className="c-r c-lbl">Đang giữ {o.reservedQty} sản phẩm</span> : null}
            </div>
            <ul className="m-0 list-none px-4 pb-3" aria-label="Sản phẩm của đơn">
              {o.items.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-2 border-t border-line-2 py-2 first:border-t-0"
                >
                  <span className="min-w-0 flex-1">
                    <b>{l.name}</b> {l.isGift ? <span className="c-pill is-ok">Quà tặng</span> : null}
                    <span className="c-lbl block tabular">
                      {l.sku}
                      {l.trackSerial
                        ? l.serials.length
                          ? ` · Serial ${l.serials.join(", ")}`
                          : " · Chưa gán serial"
                        : ""}
                    </span>
                  </span>
                  <span className="tabular">×{l.qty}</span>
                  <span className="w-32 text-right tabular">{formatMoney(l.lineTotal)}</span>
                </li>
              ))}
            </ul>
          </section>

          {o.status !== "cancelled" ? <DeliverySteps order={o} actions={actions} /> : null}

          {o.warranties.length ? (
            <section className="c-card" aria-label="Phiếu bảo hành">
              <div className="c-ch">
                <h2>Phiếu bảo hành</h2>
              </div>
              <ul className="m-0 list-none px-4 pb-3">
                {o.warranties.map((w) => (
                  <li key={w.code} className="py-1">
                    <b>{w.code}</b> · {w.product}
                    {w.serial ? ` · serial ${w.serial}` : ""} ·{" "}
                    {w.endsOn ? (
                      `đến ${dmy(w.endsOn)}`
                    ) : (
                      <span className="text-warn">chưa đặt thời hạn bảo hành cho sản phẩm</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="c-stack">
          <section className="c-card">
            <div className="c-ch">
              <h2>Tiền</h2>
            </div>
            <div className="c-cb">
              <table className="c-rl" aria-label="Tiền của đơn">
                <tbody>
                  <tr>
                    <td>Tạm tính</td>
                    <td className="tabular">{formatMoney(m.subtotal)}</td>
                  </tr>
                  <tr>
                    <td>Giảm</td>
                    <td className="tabular">−{formatMoney(m.discount)}</td>
                  </tr>
                  <tr>
                    <td>Phí giao, lắp</td>
                    <td className="tabular">{formatMoney(m.fees)}</td>
                  </tr>
                  <tr>
                    <td>
                      <b>Tổng</b>
                    </td>
                    <td className="tabular">
                      <b>{formatMoney(m.total)}</b>
                    </td>
                  </tr>
                  <tr>
                    <td>Đã xác nhận</td>
                    <td className="tabular">{formatMoney(m.confirmed)}</td>
                  </tr>
                  <tr>
                    <td>Chờ xác nhận</td>
                    <td className="tabular">{formatMoney(m.pending)}</td>
                  </tr>
                  <tr>
                    <td>Cọc tối thiểu</td>
                    <td className="tabular">{formatMoney(m.depositMin)}</td>
                  </tr>
                </tbody>
              </table>
              <SalesCredit order={o} />
            </div>
          </section>
          <section className="c-card" aria-label="Các khoản thanh toán">
            <div className="c-ch">
              <h2>Các khoản thanh toán</h2>
            </div>
            <div className="c-cb">
              {o.payments.length === 0 ? <p className="c-lbl m-0">Chưa có khoản nào.</p> : null}
              <ul className="m-0 list-none space-y-2 p-0" aria-label="Khoản thanh toán">
                {o.payments.map((p) => (
                  <li key={p.id}>
                    <span className="flex justify-between gap-2">
                      <b>
                        {p.type === "deposit" ? "Cọc" : p.type === "balance" ? "Phần còn lại" : "Hoàn tiền"}
                      </b>
                      <span className="tabular">{formatMoney(p.amount)}</span>
                    </span>
                    <span className="c-lbl">
                      {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                      {p.reference ? `, ${p.reference}` : ""} · ghi bởi {p.by}, {p.at}
                    </span>{" "}
                    <span
                      className={`c-pill ${p.status === "confirmed" ? "is-ok" : p.status === "rejected" ? "is-err" : "is-warn"}`}
                    >
                      {p.status === "confirmed"
                        ? "Đã xác nhận"
                        : p.status === "rejected"
                          ? "Từ chối"
                          : "Chờ xác nhận"}
                    </span>
                    {p.proofUrl ? (
                      <a
                        href={p.proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="c-link ml-1.5 text-sm"
                      >
                        Xem chứng từ
                      </a>
                    ) : null}
                    {p.note ? <span className="c-lbl block">{p.note}</span> : null}
                  </li>
                ))}
              </ul>
              {o.status === "cancelled" && o.perms.refund && m.refundable > 0 ? (
                <button
                  type="button"
                  className="c-btn mt-2"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      actions.recordRefund({
                        orderId: o.id,
                        amount: m.refundable,
                        reference: `Hoàn tiền ${o.code}`,
                      }),
                    )
                  }
                >
                  Ghi hoàn tiền {formatMoney(m.refundable)}
                </button>
              ) : null}
              {!ended && o.status !== "pending_approval" && o.perms.record && balance - m.pending > 0 ? (
                <PaymentForm
                  order={o}
                  remaining={balance - m.pending}
                  firstPay={!o.payments.some((p) => p.status !== "rejected" && p.type !== "refund")}
                  actions={actions}
                />
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Doanh số người bán được tính cho đơn: tiền hàng sau giảm, ghi khi khách cọc xong, trừ lại khi hủy, trả hàng. */
function SalesCredit({ order: o }: { order: LiveOrderDetail }) {
  const sale = o.sales.credits.find((c) => c.kind === "sale");
  const reversal = o.sales.credits.find((c) => c.kind === "reversal");
  const dead = o.status === "cancelled" || o.status === "returned";
  return (
    <div role="group" className="mt-2 border-t border-line-2 pt-2" aria-label="Doanh số của đơn">
      <span className="flex justify-between gap-2">
        <b>Doanh số của {o.seller}</b>
        {sale ? (
          <b className="tabular">{formatMoney(sale.amount)}</b>
        ) : dead ? (
          <span className="c-lbl">Không tính</span>
        ) : (
          <span className="tabular text-text-weak">{formatMoney(o.sales.value)}</span>
        )}
      </span>
      <span className="c-lbl block">
        {sale
          ? `Đã tính vào tháng ${sale.month} khi khách cọc xong.`
          : dead
            ? "Đơn dừng trước khi khách cọc nên không tính doanh số."
            : "Chưa tính: doanh số được ghi khi khách cọc xong (tiền hàng sau giảm, không gồm phí giao, lắp)."}
      </span>
      {reversal ? (
        <span className="mt-1 flex justify-between gap-2 text-err">
          <span>
            Trừ lại tháng {reversal.month} ({reversal.reason ?? "Hủy đơn"})
          </span>
          <span className="tabular">−{formatMoney(Math.abs(reversal.amount))}</span>
        </span>
      ) : null}
    </div>
  );
}

function PaymentForm({
  order,
  remaining,
  firstPay,
  actions,
}: {
  order: LiveOrderDetail;
  remaining: number;
  firstPay: boolean;
  actions: OrderLiveActions;
}) {
  const { run, pending } = useRun();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  if (!open)
    return (
      <button
        type="button"
        className="c-btn mt-2"
        onClick={() => {
          setAmount(
            new Intl.NumberFormat("vi-VN").format(
              firstPay ? Math.min(remaining, order.money.depositMin) : remaining,
            ),
          );
          setOpen(true);
        }}
      >
        Ghi thanh toán
      </button>
    );
  return (
    <form
      className="mt-2 space-y-2"
      aria-label="Ghi thanh toán đơn"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        form.set("orderId", order.id);
        run(
          () => actions.recordPayment(form),
          () => setOpen(false),
        );
      }}
    >
      <label className="c-lbl block">
        Số tiền (đồng), còn phải thu {formatMoney(remaining)}
        <input
          name="amount"
          aria-label="Số tiền thanh toán"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={FIELD}
        />
      </label>
      <label className="c-lbl block">
        Phương thức
        <select
          name="method"
          aria-label="Phương thức thanh toán"
          defaultValue="bank_transfer"
          className={FIELD}
        >
          {Object.entries(PAYMENT_METHOD_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="c-lbl block">
        Nội dung chuyển khoản
        <input
          name="reference"
          aria-label="Nội dung chuyển khoản đơn"
          defaultValue={order.code}
          className={FIELD}
        />
      </label>
      <label className="c-lbl block">
        Ảnh chứng từ (không bắt buộc)
        <input
          name="proof"
          type="file"
          aria-label="Ảnh chứng từ"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          className="mt-0.5 block w-full text-sm"
        />
      </label>
      <div className="flex gap-1.5">
        <button type="submit" className="c-btn is-brand" disabled={pending}>
          Ghi nhận
        </button>
        <button type="button" className="c-btn" onClick={() => setOpen(false)}>
          Hủy
        </button>
      </div>
    </form>
  );
}

function IssueStock({ order, actions }: { order: LiveOrderDetail; actions: OrderLiveActions }) {
  const { run, pending } = useRun();
  const tracked = order.items.filter((i) => i.trackSerial);
  const [serials, setSerials] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      tracked.map((i) => [i.id, Array.from({ length: i.qty }, (_, k) => i.suggest[k] ?? "")]),
    ),
  );
  const ready = tracked.every((i) => serials[i.id]?.every((s) => s.trim()));
  return (
    <form
      aria-label="Xuất kho giao hàng"
      className="space-y-1.5 rounded-control border border-line-2 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => actions.issueStock({ orderId: order.id, serials }));
      }}
    >
      <b className="text-sm">Ghi sổ xuất kho, gán serial</b>
      {tracked.map((i) =>
        serials[i.id].map((v, k) => (
          <label key={`${i.id}-${k}`} className="c-lbl block">
            Serial {i.sku}
            {i.qty > 1 ? ` (${k + 1})` : ""}
            <input
              aria-label={`Serial ${i.sku}${i.qty > 1 ? ` ${k + 1}` : ""}`}
              list={`serials-${i.id}`}
              value={v}
              maxLength={80}
              onChange={(e) =>
                setSerials((s) => ({ ...s, [i.id]: s[i.id].map((x, j) => (j === k ? e.target.value : x)) }))
              }
              className={FIELD}
            />
            <datalist id={`serials-${i.id}`}>
              {i.suggest.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        )),
      )}
      <button type="submit" className="c-btn" disabled={pending || !ready}>
        Ghi sổ xuất kho, gán serial
      </button>
    </form>
  );
}

function Backorder({ orderId, actions }: { orderId: string; actions: OrderLiveActions }) {
  const { run, pending } = useRun();
  const [date, setDate] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => actions.setBackorder({ orderId, expected: date }));
      }}
    >
      <label className="c-lbl flex items-center gap-1.5">
        Ngày dự kiến có hàng
        <input
          type="date"
          aria-label="Ngày dự kiến có hàng"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-control border border-line bg-surface px-1.5 py-1 text-text"
        />
      </label>
      <button type="submit" className="c-btn" disabled={pending || !date}>
        Cho đặt trước, chờ hàng về
      </button>
    </form>
  );
}

function CancelOrder({ orderId, actions }: { orderId: string; actions: OrderLiveActions }) {
  const { run, pending } = useRun();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open)
    return (
      <button type="button" className="c-btn" style={{ color: "var(--err)" }} onClick={() => setOpen(true)}>
        Hủy đơn
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-control bg-err-soft p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason.trim()) return;
        run(() => actions.cancelOrder({ orderId, reason: reason.trim() }));
      }}
    >
      <input
        aria-label="Lý do hủy"
        placeholder="Lý do hủy (bắt buộc)"
        value={reason}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
        className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1"
      />
      <button
        type="submit"
        className="c-btn"
        style={{ color: "var(--err)" }}
        disabled={!reason.trim() || pending}
      >
        Xác nhận hủy
      </button>
      <button type="button" className="c-btn" onClick={() => setOpen(false)}>
        Thôi
      </button>
      <span className="c-lbl w-full">
        Đơn đã có tiền thì Owner ghi hoàn tiền trên đơn sau khi hủy; giai đoạn lead không tự đổi, người bán
        quyết định.
      </span>
    </form>
  );
}

const REACHED = [
  "draft",
  "pending_approval",
  "confirmed",
  "deposit_paid",
  "ready_to_ship",
  "delivering",
  "installed",
  "completed",
];

/** Bước giao lắp (CLAUDE.md 8.7): giai đoạn 1 cập nhật tay trên hồ sơ đơn, app kỹ thuật viên làm sau. */
function DeliverySteps({ order: o, actions }: { order: LiveOrderDetail; actions: OrderLiveActions }) {
  const { run, pending } = useRun();
  const [date, setDate] = useState(o.delivery.scheduledOn ?? "");
  const [note, setNote] = useState(o.delivery.note);
  const reached = (s: string) => REACHED.indexOf(o.status) >= REACHED.indexOf(s);
  const steps: [string, boolean][] = [
    ["Xác nhận người nhận và địa chỉ", reached("confirmed")],
    ["Ghi sổ xuất kho, gán serial", o.delivery.stockIssued],
    ["Giao và lắp đặt", reached("installed")],
    ["Gửi video bàn giao cho người đặt", o.delivery.handoverSent || reached("completed")],
    ["Hoàn tất, sinh phiếu bảo hành", reached("completed")],
  ];
  const editable =
    o.perms.delivery && !["completed", "cancelled", "returned", "pending_approval"].includes(o.status);
  return (
    <section className="c-card" aria-label="Giao lắp">
      <div className="c-ch">
        <h2>Giao lắp</h2>
        <span className="c-r c-lbl">
          {o.delivery.scheduledOn ? `Hẹn giao ${dmy(o.delivery.scheduledOn)}` : "Chưa hẹn ngày giao"}
        </span>
      </div>
      <ol className="m-0 list-none space-y-1 px-4 pb-3">
        {steps.map(([label, done]) => (
          <li key={label} className="flex items-center gap-2">
            <span className={`c-pill ${done ? "is-ok" : "is-n"}`}>{done ? "Xong" : "Chưa"}</span>
            {label}
          </li>
        ))}
      </ol>
      {editable ? (
        <form
          className="flex flex-wrap items-end gap-1.5 px-4 pb-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => actions.updateDelivery({ orderId: o.id, scheduledOn: date || null, note }));
          }}
        >
          <label className="c-lbl">
            Ngày hẹn giao
            <input
              type="date"
              aria-label="Ngày hẹn giao"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="c-lbl min-w-40 flex-1">
            Ghi chú cho đội lắp
            <input
              aria-label="Ghi chú cho đội lắp"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              className={FIELD}
            />
          </label>
          <button type="submit" className="c-btn" disabled={pending}>
            Lưu lịch giao
          </button>
          {o.status === "installed" && !o.delivery.handoverSent ? (
            <button
              type="button"
              className="c-btn"
              disabled={pending}
              onClick={() =>
                run(() =>
                  actions.updateDelivery({ orderId: o.id, scheduledOn: date || null, note, handover: true }),
                )
              }
            >
              Gửi video bàn giao
            </button>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
