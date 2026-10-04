"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useState } from "react";

import { PRODUCTS, STAFF, VARIANTS, type OrderStatus } from "@/lib/demo/data";
import { ORDER_PATH, ORDER_STATUS } from "@/lib/demo/labels";
import { NEXT_STATUS, transitionBlockers } from "@/lib/sales/orders";
import { LocTag, PageHead } from "../parts";
import { useShell } from "../shell-context";
import {
  issueBlockers,
  orderFacts,
  orderMoney,
  orderPeople,
  orderRisks,
  stockBlockers,
  useCrm,
  visibleOrders,
  vnd,
  type OrderRec,
} from "../store";
import { WAREHOUSES } from "@/lib/demo/data";

// Đơn hàng (CLAUDE.md 8.7): luồng trạng thái kiểm điều kiện ở hàm thuần lib/sales/orders.ts;
// tiền ghi nhận và xác nhận do hai người khác nhau; đã cọc thì giữ hàng; xuất kho gán serial; hoàn tất sinh bảo hành.

const TONE = { ok: "is-ok", warn: "is-warn", err: "is-err", neutral: "is-n" } as const;
const staff = (id: string) => STAFF.find((s) => s.id === id)?.fullName ?? "Chưa rõ";
const vLabel = (id: string) => {
  const v = VARIANTS.find((x) => x.id === id);
  const p = PRODUCTS.find((x) => x.id === v?.productId);
  return v && p ? (v.name === "Tiêu chuẩn" ? p.name : `${p.name} ${v.name.toLowerCase()}`) : id;
};
const money = (v: number) => vnd(v);

function useVisibleOrders() {
  const { state } = useCrm();
  const { perms, userId } = useShell();
  return visibleOrders(state.orders, perms, userId);
}

const FILTERS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "approval", label: "Chờ duyệt", statuses: ["pending_approval"] },
  { key: "deposit", label: "Chờ cọc", statuses: ["confirmed"] },
  { key: "holding", label: "Đang giữ hàng", statuses: ["deposit_paid"] },
  { key: "shipping", label: "Chờ giao, đang giao", statuses: ["ready_to_ship", "delivering", "installed"] },
  { key: "done", label: "Hoàn tất", statuses: ["completed"] },
  { key: "cancelled", label: "Đã hủy", statuses: ["cancelled"] },
];

export function CrmOrders() {
  const { can } = useShell();
  const all = useVisibleOrders();
  const [f, setF] = useState<string | null>(null);
  const filter = FILTERS.find((x) => x.key === f);
  const rows = all
    .filter((o) => !filter || filter.statuses.includes(o.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={ShoppingCart}
          color="var(--obj-lead)"
          kicker="Đơn hàng"
          title={can("order.view_all") ? "Đơn hàng" : "Đơn của tôi"}
        >
          <span className="c-lbl">{rows.length} đơn, mới nhất trước</span>
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
              {x.label} ({all.filter((o) => x.statuses.includes(o.status)).length})
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
              {rows.map((o) => {
                const m = orderMoney(o);
                const p = orderPeople(o);
                const risks = orderRisks(o);
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.id}`} className="c-link font-semibold tabular">
                        {o.code}
                      </Link>
                    </td>
                    <td>
                      {p.buyer} <LocTag loc={p.buyerMarket} />
                      {risks.length ? (
                        <span className="c-lbl block text-warn">{risks.join(", ")}</span>
                      ) : null}
                    </td>
                    <td>
                      {p.self ? (
                        <span className="c-lbl">Chính khách</span>
                      ) : (
                        p.recipient || <span className="text-warn">Chưa xác nhận</span>
                      )}
                    </td>
                    <td className="text-right tabular">{money(m.total)}</td>
                    <td className="text-right tabular">{money(m.confirmed)}</td>
                    <td className="text-right tabular">{money(Math.max(0, m.balance))}</td>
                    <td>
                      <span className={`c-pill ${TONE[ORDER_STATUS[o.status].tone]}`}>
                        {ORDER_STATUS[o.status].label}
                      </span>
                    </td>
                    <td>{staff(o.sellerId)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? <p className="c-empty">Chưa có đơn nào ở nhóm này.</p> : null}
      </section>
    </div>
  );
}

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: "Xác nhận đơn",
  deposit_paid: "Chuyển sang Đã cọc, giữ hàng",
  ready_to_ship: "Chuyển sang Sẵn sàng giao",
  delivering: "Bắt đầu giao",
  installed: "Xác nhận đã lắp",
  completed: "Hoàn tất đơn",
};

export function CrmOrder({ id }: { id: string }) {
  const { state, act } = useCrm();
  const { can, me, userId } = useShell();
  const router = useRouter();
  const o = useVisibleOrders().find((x) => x.id === id);
  if (!o) notFound();
  const m = orderMoney(o);
  const facts = orderFacts(o);
  const next = NEXT_STATUS[o.status];
  const blockers = next
    ? [...transitionBlockers(facts, next), ...(next === "deposit_paid" ? stockBlockers(state, o) : [])]
    : [];
  const people = orderPeople(o);
  const mine = o.sellerId === userId;
  const canEdit = can("order.edit_all") || (can("order.edit_own") && mine);
  const deliveryStep = next === "delivering" || next === "installed" || next === "completed";
  const canAdvance = next && (deliveryStep ? can("delivery.update") : canEdit);
  const cur = ORDER_PATH.findIndex((p) => p.status === o.status);
  const warranties = state.warranties.filter((w) => w.orderId === o.id);
  const ended = o.status === "completed" || o.status === "cancelled";
  function openLead() {
    if (!o?.oppId) return;
    act({ type: "selectOpp", id: o.oppId });
    router.push("/opportunities");
  }

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead icon={ShoppingCart} color="var(--obj-lead)" kicker="Đơn hàng" title={`Đơn ${o.code}`}>
          <span className={`c-pill ${TONE[ORDER_STATUS[o.status].tone]}`}>
            {ORDER_STATUS[o.status].label}
          </span>
        </PageHead>
        <div className="c-hl">
          <div>
            <span className="c-lbl">Kênh</span>
            <b>{o.channel}</b>
          </div>
          <div>
            <span className="c-lbl">Người bán</span>
            <b>{staff(o.sellerId)}</b>
          </div>
          <div>
            <span className="c-lbl">Tổng</span>
            <b className="tabular">{money(m.total)}</b>
          </div>
          <div>
            <span className="c-lbl">Còn phải thu</span>
            <b className="tabular">{money(Math.max(0, m.balance))}</b>
          </div>
          <div>
            <span className="c-lbl">Giữ hàng đến</span>
            <b>{o.holdUntil ? o.holdUntil.split("-").reverse().join("/") : "—"}</b>
          </div>
          {o.oppId ? (
            <div>
              <span className="c-lbl">Từ báo giá</span>
              <b>
                <button type="button" className="c-link" onClick={openLead}>
                  {o.quoteId} · mở hồ sơ lead
                </button>
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
          Đơn giảm vượt giới hạn của người bán, đang chờ Owner duyệt. Chưa giữ hàng.
        </p>
      ) : (
        <ol aria-label="Các bước đơn hàng" className="c-steps m-0 list-none p-0">
          {ORDER_PATH.map((p, i) => (
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
              {next && !ended ? (
                <>
                  {blockers.length ? (
                    <ul className="m-0 list-none space-y-1 p-0" aria-label="Điều kiện chưa đạt">
                      {blockers.map((b) => (
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
                        disabled={blockers.length > 0}
                        onClick={() =>
                          act(
                            { type: "orderAdvance", orderId: o.id, actor: me },
                            `Đơn ${o.code}: ${NEXT_LABEL[next]?.toLowerCase()}`,
                          )
                        }
                      >
                        {NEXT_LABEL[next]}
                      </button>
                    ) : (
                      <span className="c-lbl">Bạn chưa có quyền chuyển bước này.</span>
                    )}
                    {o.status === "ready_to_ship" &&
                    !o.stockIssued &&
                    (can("inventory.post") || can("delivery.update")) ? (
                      <button
                        type="button"
                        className="c-btn"
                        disabled={issueBlockers(state, o).length > 0}
                        title={issueBlockers(state, o).join("; ") || undefined}
                        onClick={() =>
                          act(
                            { type: "orderIssueStock", orderId: o.id, actor: me },
                            "Đã ghi sổ xuất kho và gán serial",
                          )
                        }
                      >
                        Ghi sổ xuất kho, gán serial
                      </button>
                    ) : null}
                    {(o.status === "deposit_paid" || o.status === "confirmed") &&
                    !o.codApproved &&
                    can("payment.confirm") ? (
                      <button
                        type="button"
                        className="c-btn"
                        onClick={() =>
                          act(
                            { type: "orderCod", orderId: o.id, actor: me },
                            "Đã duyệt thu phần còn lại khi giao",
                          )
                        }
                      >
                        Duyệt thu khi giao
                      </button>
                    ) : null}
                    {o.codApproved ? <span className="c-pill is-ok">Được thu khi giao</span> : null}
                  </div>
                </>
              ) : null}
              {["confirmed", "draft"].includes(o.status) && canEdit ? (
                <label className="c-lbl flex flex-wrap items-center gap-1.5">
                  Kho xuất
                  <select
                    aria-label="Kho xuất"
                    value={o.warehouseId}
                    onChange={(e) =>
                      act(
                        { type: "orderWarehouse", orderId: o.id, warehouseId: e.target.value, actor: me },
                        "Đã đổi kho xuất",
                      )
                    }
                    className="rounded-control border border-line bg-surface px-1.5 py-1 text-text"
                  >
                    {WAREHOUSES.filter((w) => w.id !== "wh-demo").map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {next === "deposit_paid" && stockBlockers(state, o).length && can("order.allow_backorder") ? (
                <button
                  type="button"
                  className="c-btn"
                  onClick={() =>
                    act(
                      { type: "orderBackorder", orderId: o.id, expected: "2026-10-15", actor: me },
                      "Đã cho đặt trước, dự kiến có hàng 15/10",
                    )
                  }
                >
                  Cho đặt trước, chờ hàng về
                </button>
              ) : null}
              {o.backorder ? (
                <span className="c-pill is-warn">
                  Đặt trước, dự kiến có hàng {o.backorder.expected.split("-").reverse().join("/")}
                </span>
              ) : null}
              {!ended && can("order.cancel") ? <CancelOrder order={o} /> : null}
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
                    {people.buyerHref ? (
                      <Link href={people.buyerHref} className="c-link">
                        {people.buyer}
                      </Link>
                    ) : (
                      people.buyer
                    )}{" "}
                    <LocTag loc={people.buyerMarket} />
                  </b>
                  {people.buyerPhoneMasked ? (
                    <span className="c-lbl tabular">{people.buyerPhoneMasked}</span>
                  ) : null}
                </div>
                <div>
                  <span className="c-lbl">Người nhận</span>
                  <b>
                    {people.self
                      ? "Chính người đặt"
                      : people.recipient || <span className="text-warn">Chưa xác nhận</span>}
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
            </div>
          </section>

          <section className="c-card">
            <div className="c-ch">
              <h2>Sản phẩm</h2>
            </div>
            <ul className="m-0 list-none px-4 pb-3">
              {o.lines.map((l, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-2 border-t border-line-2 py-2 first:border-t-0"
                >
                  <span className="min-w-0 flex-1">
                    <b>{vLabel(l.variantId)}</b>{" "}
                    {l.isGift ? <span className="c-pill is-ok">Quà tặng</span> : null}
                    <span className="c-lbl block tabular">
                      {l.serial ? `Serial ${l.serial}` : "Chưa gán serial"}
                    </span>
                  </span>
                  <span className="tabular">×{l.qty}</span>
                  <span className="w-32 text-right tabular">{money(l.unitPrice * l.qty - l.discount)}</span>
                </li>
              ))}
            </ul>
          </section>

          {o.status !== "cancelled" ? <DeliverySteps order={o} /> : null}

          {warranties.length ? (
            <section className="c-card" aria-label="Phiếu bảo hành">
              <div className="c-ch">
                <h2>Phiếu bảo hành</h2>
              </div>
              <ul className="m-0 list-none px-4 pb-3">
                {warranties.map((w) => (
                  <li key={w.id} className="py-1">
                    <b>{w.id}</b> · {w.product} · serial {w.serial} · đến{" "}
                    {w.end.split("-").reverse().join("/")}
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
              <table className="c-rl">
                <tbody>
                  <tr>
                    <td>Tạm tính</td>
                    <td className="tabular">{money(m.subtotal)}</td>
                  </tr>
                  <tr>
                    <td>Giảm</td>
                    <td className="tabular">−{money(m.discount)}</td>
                  </tr>
                  <tr>
                    <td>Phí giao, lắp</td>
                    <td className="tabular">{money(m.fees)}</td>
                  </tr>
                  <tr>
                    <td>
                      <b>Tổng</b>
                    </td>
                    <td className="tabular">
                      <b>{money(m.total)}</b>
                    </td>
                  </tr>
                  <tr>
                    <td>Đã xác nhận</td>
                    <td className="tabular">{money(m.confirmed)}</td>
                  </tr>
                  <tr>
                    <td>Chờ xác nhận</td>
                    <td className="tabular">{money(m.pending)}</td>
                  </tr>
                  <tr>
                    <td>Cọc tối thiểu</td>
                    <td className="tabular">{money(facts.depositMinimum)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <section className="c-card" aria-label="Các khoản thanh toán">
            <div className="c-ch">
              <h2>Các khoản thanh toán</h2>
            </div>
            <div className="c-cb">
              {o.payments.length === 0 ? <p className="c-lbl m-0">Chưa có khoản nào.</p> : null}
              <ul className="m-0 list-none space-y-2 p-0">
                {o.payments.map((p, i) => (
                  <li key={i}>
                    <span className="flex justify-between gap-2">
                      <b>
                        {p.type === "deposit" ? "Cọc" : p.type === "balance" ? "Phần còn lại" : "Hoàn tiền"}
                      </b>
                      <span className="tabular">{money(p.amount)}</span>
                    </span>
                    <span className="c-lbl">
                      {p.method}, {p.reference} · ghi bởi {staff(p.recordedBy)}
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
                  </li>
                ))}
              </ul>
              {!ended &&
              can("payment.record") &&
              (can("order.edit_all") || mine || can("order.view_all")) &&
              m.balance - m.pending > 0 ? (
                <OrderPaymentForm
                  order={o}
                  remaining={m.balance - m.pending}
                  depositMin={facts.depositMinimum}
                />
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function OrderPaymentForm({
  order,
  remaining,
  depositMin,
}: {
  order: OrderRec;
  remaining: number;
  depositMin: number;
}) {
  const { act } = useCrm();
  const { me, userId } = useShell();
  const firstPay = !order.payments.some((p) => p.status !== "rejected");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Chuyển khoản tài khoản công ty");
  const [ref, setRef] = useState(order.code);
  if (!open)
    return (
      <button
        type="button"
        className="c-btn mt-2"
        onClick={() => {
          setAmount(String(firstPay ? Math.min(remaining, depositMin) : remaining));
          setOpen(true);
        }}
      >
        Ghi thanh toán
      </button>
    );
  const field = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";
  return (
    <form
      className="mt-2 space-y-2"
      aria-label="Ghi thanh toán đơn"
      onSubmit={(e) => {
        e.preventDefault();
        const v = Math.round(Number(amount.replace(/[^\d]/g, "")));
        if (!v || v > remaining) return;
        act(
          {
            type: "orderPayment",
            orderId: order.id,
            payType: firstPay ? "deposit" : "balance",
            method,
            amount: v,
            reference: ref.trim(),
            actorId: userId,
            actor: me,
          },
          "Đã ghi nhận, chờ người có quyền xác nhận tiền về",
        );
        setOpen(false);
      }}
    >
      <label className="c-lbl block">
        Số tiền (đồng), còn phải thu {vnd(remaining)}
        <input
          aria-label="Số tiền thanh toán"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={field}
        />
      </label>
      <label className="c-lbl block">
        Phương thức
        <select
          aria-label="Phương thức thanh toán"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className={field}
        >
          <option>Chuyển khoản tài khoản công ty</option>
          <option>Tiền mặt tại showroom</option>
          <option>Thu khi giao</option>
        </select>
      </label>
      <label className="c-lbl block">
        Nội dung chuyển khoản
        <input
          aria-label="Nội dung chuyển khoản đơn"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          className={field}
        />
      </label>
      <div className="flex gap-1.5">
        <button type="submit" className="c-btn is-brand">
          Ghi nhận
        </button>
        <button type="button" className="c-btn" onClick={() => setOpen(false)}>
          Hủy
        </button>
      </div>
    </form>
  );
}

function CancelOrder({ order }: { order: OrderRec }) {
  const { act } = useCrm();
  const { me } = useShell();
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
        act(
          { type: "orderCancel", orderId: order.id, reason: reason.trim(), actor: me },
          `Đã hủy đơn ${order.code}, nhả hàng đang giữ`,
        );
      }}
    >
      <input
        aria-label="Lý do hủy"
        placeholder="Lý do hủy (bắt buộc)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1"
      />
      <button type="submit" className="c-btn" style={{ color: "var(--err)" }} disabled={!reason.trim()}>
        Xác nhận hủy
      </button>
      <button type="button" className="c-btn" onClick={() => setOpen(false)}>
        Thôi
      </button>
      <span className="c-lbl w-full">
        Đơn đã có tiền thì ghi hoàn tiền riêng; giai đoạn lead không tự đổi, người bán quyết định.
      </span>
    </form>
  );
}

/**
 * Bước giao lắp của đơn (CLAUDE.md 8.7, `deliveries`): giai đoạn 1 cập nhật tay trên hồ sơ đơn, app cho kỹ thuật
 * viên làm sau. Các bước đọc từ trạng thái đơn; riêng video bàn giao ghi nhận bằng nút.
 */
function DeliverySteps({ order: o }: { order: OrderRec }) {
  const { act } = useCrm();
  const { can, me } = useShell();
  const reached = (s: OrderStatus) => {
    const order: OrderStatus[] = [
      "draft",
      "pending_approval",
      "confirmed",
      "deposit_paid",
      "ready_to_ship",
      "delivering",
      "installed",
      "completed",
    ];
    return order.indexOf(o.status) >= order.indexOf(s);
  };
  const steps: [string, boolean][] = [
    ["Xác nhận người nhận và địa chỉ", reached("confirmed")],
    ["Ghi sổ xuất kho, gán serial", o.stockIssued],
    ["Giao và lắp đặt", reached("installed")],
    ["Gửi video bàn giao cho người đặt", Boolean(o.handoverSent) || reached("completed")],
    ["Hoàn tất, sinh phiếu bảo hành", reached("completed")],
  ];
  return (
    <section className="c-card" aria-label="Giao lắp">
      <div className="c-ch">
        <h2>Giao lắp</h2>
        <span className="c-r c-lbl">
          {o.deliveryDate
            ? `Hẹn giao ${o.deliveryDate.split("-").reverse().join("/")}`
            : "Chưa hẹn ngày giao"}
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
      {o.status === "installed" && !o.handoverSent && can("delivery.update") ? (
        <div className="px-4 pb-3">
          <button
            type="button"
            className="c-btn"
            onClick={() =>
              act({ type: "orderHandover", orderId: o.id, actor: me }, "Đã gửi video bàn giao cho người đặt")
            }
          >
            Gửi video bàn giao
          </button>
        </div>
      ) : null}
    </section>
  );
}
