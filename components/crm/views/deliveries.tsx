"use client";

import { Gift, Truck } from "lucide-react";
import { useRouter } from "next/navigation";

import { DELIVERY_STEPS, houseById, tr } from "@/lib/demo/crm-data";
import { LocTag, PageHead, Steps } from "../parts";
import { useShell } from "../shell";
import { useCrm } from "../store";

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
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
