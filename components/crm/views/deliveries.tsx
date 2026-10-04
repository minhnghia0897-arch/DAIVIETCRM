"use client";

import { Gift, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DELIVERY_STEPS, houseById, tr, type Delivery } from "@/lib/demo/crm-data";
import { LocTag, PageHead, Steps } from "../parts";
import { useShell } from "../shell";
import { useCrm, vnd, type PaymentRec } from "../store";

const ADVANCE = [
  { label: "Xác nhận người nhận", toast: "Đã xác nhận người nhận" },
  { label: "Ghi sổ xuất kho, gán serial", toast: "Đã xuất kho, serial đã gán" },
  { label: "Xác nhận đã giao và lắp", toast: "Đã giao và lắp xong" },
  { label: "Gửi video bàn giao", toast: "Đã gửi video bàn giao cho người đặt" },
  { label: "Ghi nhận đánh giá, hoàn tất", toast: "Đơn đã hoàn tất, sinh phiếu bảo hành" },
];

export function CrmDeliveries() {
  const { state, act } = useCrm();
  const { can, me, ask } = useShell();
  const router = useRouter();
  const all = can("order.view_all");
  const mine = new Set(state.opps.filter((o) => o.owner === me).map((o) => o.name));
  const list = all ? state.deliveries : state.deliveries.filter((d) => mine.has(d.buyer));
  const d = list.find((x) => x.id === state.delSel) ?? list[0];
  const unpaid = Boolean(d && d.step === 1 && d.totalVnd !== undefined && (d.paidVnd ?? 0) < d.totalVnd);

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={Truck}
          color="var(--ok)"
          kicker={all ? "Toàn showroom" : "Đơn của tôi"}
          title="Đơn & giao lắp"
        >
          <span className="c-lbl">
            {list.filter((x) => x.step < 5).length} đơn đang giao · {list.filter((x) => x.flag).length} cần
            chú ý
          </span>
        </PageHead>
      </section>
      {list.length === 0 ? <p className="c-card c-empty">Chưa có đơn nào của bạn đang giao.</p> : null}
      {d ? (
        <div className="c-split">
          <section className="c-card">
            <div className="c-tw">
              <table className="c-table is-click">
                <thead>
                  <tr>
                    <th>Mã đơn</th>
                    <th>Người đặt</th>
                    <th>Người nhận</th>
                    <th>Sản phẩm</th>
                    <th>Bước</th>
                    <th>Hẹn giao</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((x) => (
                    <tr
                      key={x.id}
                      className={x.id === d.id ? "is-sel" : undefined}
                      onClick={() => act({ type: "selectDelivery", id: x.id })}
                    >
                      <td>
                        <button
                          type="button"
                          className="c-link font-semibold"
                          onClick={() => act({ type: "selectDelivery", id: x.id })}
                        >
                          {x.id}
                        </button>
                      </td>
                      <td>
                        {x.buyer} {x.buyerCity ? <LocTag loc="KR" /> : null}
                      </td>
                      <td>{x.recipient}</td>
                      <td>{x.product.replace("Ghế massage ", "Ghế ")}</td>
                      <td>
                        <span className={`c-pill ${x.step >= 5 ? "is-ok" : x.flag ? "is-warn" : "is-n"}`}>
                          {x.step >= 5 ? "Hoàn tất" : DELIVERY_STEPS[x.step]}
                        </span>
                      </td>
                      <td>{x.eta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="c-card" aria-label={`Đơn ${d.id}`}>
            <div className="c-ch">
              <h2>Đơn {d.id}</h2>
              <span className="c-r">
                <span className="c-pill is-n tabular">{tr(d.value)}</span>
              </span>
            </div>
            <div className="c-cb">
              <div className="c-gift">
                <Gift size={20} className="text-ai" aria-hidden />
                <div>
                  <span className="c-lbl">Người đặt</span>
                  <b>
                    {d.buyer} {d.buyerCity ? <LocTag loc="KR" city={d.buyerCity} /> : null}
                  </b>
                </div>
                <div>
                  <span className="c-lbl">Người nhận</span>
                  <b>{d.recipient}</b>
                  <span className="c-lbl">{d.address}</span>
                </div>
              </div>
              <Steps labels={DELIVERY_STEPS} current={d.step} />
              <table className="c-rl">
                <tbody>
                  <tr>
                    <td>Sản phẩm</td>
                    <td>{d.product}</td>
                  </tr>
                  <tr>
                    <td>Thanh toán</td>
                    <td>{d.payment}</td>
                  </tr>
                  <tr>
                    <td>Hẹn giao</td>
                    <td>{d.eta}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 mb-0 text-[13px]">{d.note}</p>
              {d.flag ? (
                <p className="mt-2 mb-0">
                  <span className="c-pill is-warn">{d.flag}</span>
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.step < 5 && can("delivery.update") ? (
                  <button
                    type="button"
                    className="c-btn is-brand"
                    disabled={unpaid}
                    title={unpaid ? "Cần thu đủ tiền (đã xác nhận) trước khi xuất kho" : undefined}
                    onClick={() => act({ type: "advanceDelivery" }, ADVANCE[d.step].toast)}
                  >
                    {d.step === 0 && d.flag
                      ? "Người đặt đã cho phép, xác nhận người nhận"
                      : ADVANCE[d.step].label}
                  </button>
                ) : d.step >= 5 ? (
                  <span className="c-pill is-ok">Hoàn tất, đã sinh bảo hành và lịch chăm sóc</span>
                ) : null}
                <button
                  type="button"
                  className="c-btn"
                  onClick={() => ask("Soạn tin cập nhật cho người tặng")}
                >
                  Soạn tin cho người tặng
                </button>
                {d.houseId ? (
                  <button
                    type="button"
                    className="c-btn"
                    onClick={() => {
                      act({ type: "selectHouse", id: d.houseId! });
                      router.push("/households");
                    }}
                  >
                    Mở hồ sơ {houseById(d.houseId)?.name}
                  </button>
                ) : null}
              </div>
              {unpaid ? (
                <p className="c-lbl mt-1 mb-0">Cần thu đủ tiền (đã xác nhận) trước khi xuất kho.</p>
              ) : null}
              <Payments key={d.id} delivery={d} />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

const PAY_STATUS: Record<PaymentRec["status"], [string, string]> = {
  recorded: ["Chờ xác nhận", "is-warn"],
  confirmed: ["Đã xác nhận", "is-ok"],
  rejected: ["Bị từ chối", "is-err"],
};

const METHODS = ["Chuyển khoản tài khoản công ty", "Tiền mặt tại showroom", "Thu khi giao"];

/** Thanh toán của đơn: người bán ghi nhận, người có quyền xác nhận tiền về (tách hai người, CLAUDE.md 8.1). */
function Payments({ delivery: d }: { delivery: Delivery }) {
  const { state, act } = useCrm();
  const { can, me } = useShell();
  const pays = state.payments.filter((p) => p.deliveryId === d.id);
  const paid = d.paidVnd ?? 0;
  const pending = pays.filter((p) => p.status === "recorded").reduce((s, p) => s + p.amount, 0);
  const remaining = d.totalVnd !== undefined ? Math.max(0, d.totalVnd - paid - pending) : 0;
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"deposit" | "balance">(paid ? "balance" : "deposit");
  const [method, setMethod] = useState(METHODS[0]);
  const [amount, setAmount] = useState(
    String(paid ? remaining : Math.min(remaining, d.depositMin ?? remaining)),
  );
  const [ref, setRef] = useState(d.id);
  if (d.totalVnd === undefined) return null;

  return (
    <div className="mt-3 border-t border-line-2 pt-3">
      <b>Thanh toán</b>
      <p className="c-lbl mt-0.5 mb-1 tabular">
        Tổng {vnd(d.totalVnd)} · đã xác nhận {vnd(paid)}
        {pending ? ` · chờ xác nhận ${vnd(pending)}` : ""} · còn {vnd(Math.max(0, d.totalVnd - paid))} · cọc
        tối thiểu {vnd(d.depositMin ?? 0)}
      </p>
      {pays.length ? (
        <ul className="m-0 list-none p-0">
          {pays.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-1.5 py-1">
              <span className={`c-pill ${PAY_STATUS[p.status][1]}`}>{PAY_STATUS[p.status][0]}</span>
              <span className="tabular">{vnd(p.amount)}</span>
              <span className="c-lbl">
                {p.type === "deposit" ? "Cọc" : "Thanh toán"} · {p.method} · {p.recordedBy} ghi
                {p.confirmedBy
                  ? ` · ${p.confirmedBy} ${p.status === "confirmed" ? "xác nhận" : "từ chối"}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {pays.some((p) => p.status === "recorded") ? (
        <p className="c-lbl mt-1 mb-0">Khoản chờ xác nhận nằm ở hàng Chờ duyệt (thanh dưới cùng).</p>
      ) : null}
      {can("payment.record") && remaining > 0 ? (
        open ? (
          <form
            className="c-nba"
            aria-label="Ghi nhận thanh toán"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Math.round(Number(amount.replace(/[^\d]/g, "")));
              if (!v) return;
              act(
                {
                  type: "recordPayment",
                  deliveryId: d.id,
                  payType: type,
                  method,
                  amount: v,
                  reference: ref.trim(),
                  actor: me,
                },
                "Đã ghi nhận, chờ người có quyền xác nhận tiền về",
              );
              setOpen(false);
            }}
          >
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-1">
                <input type="radio" checked={type === "deposit"} onChange={() => setType("deposit")} /> Cọc
              </label>
              <label className="inline-flex items-center gap-1">
                <input type="radio" checked={type === "balance"} onChange={() => setType("balance")} /> Thanh
                toán còn lại
              </label>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="c-lbl">
                Số tiền (đồng)
                <input
                  aria-label="Số tiền"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text tabular"
                />
              </label>
              <label className="c-lbl">
                Phương thức
                <select
                  aria-label="Phương thức"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text"
                >
                  {METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="c-lbl sm:col-span-2">
                Nội dung chuyển khoản, mã giao dịch
                <input
                  aria-label="Nội dung chuyển khoản"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  className="mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text"
                />
              </label>
            </div>
            <p className="c-lbl mt-1 mb-0">Ảnh chứng từ lưu ở kho riêng tư khi có dữ liệu thật.</p>
            <div className="mt-2 flex gap-1.5">
              <button type="submit" className="c-btn is-brand">
                Ghi nhận
              </button>
              <button type="button" className="c-btn" onClick={() => setOpen(false)}>
                Hủy
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="c-btn mt-1"
            onClick={() => {
              // Mặc định: lần đầu là mức cọc tối thiểu, các lần sau là số còn phải thu.
              setType(paid || pending ? "balance" : "deposit");
              setAmount(String(paid || pending ? remaining : Math.min(remaining, d.depositMin ?? remaining)));
              setOpen(true);
            }}
          >
            Ghi nhận thanh toán
          </button>
        )
      ) : null}
    </div>
  );
}
