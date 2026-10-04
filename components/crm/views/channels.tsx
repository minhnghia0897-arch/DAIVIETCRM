"use client";

import { Megaphone } from "lucide-react";

import { CHANNEL_STATS, CONTENT_QUEUE, KOC_BOOKINGS, LIVESTREAMS, tr } from "@/lib/demo/crm-data";
import { PageHead } from "../parts";
import { useShell } from "../shell";

const fmt1 = (v: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(v);

// Kênh & nội dung: hiệu quả từng nguồn lead, lịch live, KOC, hàng nội dung, vòng lặp niềm tin.
export function CrmChannels() {
  const { ask } = useShell();
  const totals = CHANNEL_STATS.reduce(
    (s, [, leads, cost, orders, rev]) => ({
      leads: s.leads + leads,
      cost: s.cost + cost,
      orders: s.orders + orders,
      rev: s.rev + rev,
    }),
    { leads: 0, cost: 0, orders: 0, rev: 0 },
  );
  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={Megaphone}
          color="var(--obj-lead)"
          kicker="Quý IV đến hôm nay"
          title="Kênh & nội dung"
        >
          <button
            type="button"
            className="c-btn is-ai"
            onClick={() => ask("Nên dồn ngân sách vào kênh nào?")}
          >
            Hỏi AI về ngân sách
          </button>
        </PageHead>
        <div className="c-kpis">
          <div>
            <span className="c-lbl">Lead</span>
            <strong>{totals.leads}</strong>
          </div>
          <div>
            <span className="c-lbl">Chi phí</span>
            <strong>{tr(totals.cost)}</strong>
          </div>
          <div>
            <span className="c-lbl">Đơn</span>
            <strong>{totals.orders}</strong>
          </div>
          <div>
            <span className="c-lbl">Doanh thu</span>
            <strong>{tr(totals.rev)}</strong>
          </div>
        </div>
      </section>

      <section className="c-card">
        <div className="c-ch">
          <h2>Hiệu quả theo kênh</h2>
        </div>
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Kênh</th>
                <th className="text-right">Lead</th>
                <th className="text-right">Chi phí</th>
                <th className="text-right">Chi phí mỗi lead</th>
                <th className="text-right">Đơn</th>
                <th className="text-right">Tỷ lệ chốt</th>
                <th className="text-right">Chi phí mỗi đơn</th>
                <th className="text-right">Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {CHANNEL_STATS.map(([name, leads, cost, orders, rev]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="text-right tabular">{leads}</td>
                  <td className="text-right tabular">{cost ? tr(cost) : "0"}</td>
                  <td className="text-right tabular">{cost ? `${fmt1((cost * 1000) / leads)}k` : "—"}</td>
                  <td className="text-right tabular">{orders}</td>
                  <td className="text-right tabular">{fmt1((orders / leads) * 100)}%</td>
                  <td className="text-right tabular">{cost ? tr(cost / orders) : "—"}</td>
                  <td className="text-right tabular">
                    <b>{tr(rev)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="c-rgrid">
        <section className="c-card">
          <div className="c-ch">
            <h2>Lịch livestream</h2>
          </div>
          <div className="c-cb">
            <table className="c-rl">
              <tbody>
                {LIVESTREAMS.map(([when, topic, kr]) => (
                  <tr key={when}>
                    <td>
                      <b>{when}</b>
                      <div className="c-lbl">{topic}</div>
                    </td>
                    <td>
                      <span className="c-loc is-kr">{kr}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="c-card">
          <div className="c-ch">
            <h2>KOC, KOL</h2>
          </div>
          <div className="c-cb">
            <table className="c-rl">
              <tbody>
                {KOC_BOOKINGS.map(([name, reach, when, status]) => (
                  <tr key={name}>
                    <td>
                      <b>{name}</b>
                      <div className="c-lbl">
                        {reach} · {when}
                      </div>
                    </td>
                    <td>
                      <span className={`c-pill ${status.startsWith("Đã") ? "is-ok" : "is-warn"}`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="c-card">
          <div className="c-ch">
            <h2>Hàng nội dung</h2>
          </div>
          <div className="c-cb">
            <table className="c-rl">
              <tbody>
                {CONTENT_QUEUE.map(([title, use, status]) => (
                  <tr key={title}>
                    <td>
                      <b>{title}</b>
                      <div className="c-lbl">{use}</div>
                    </td>
                    <td>
                      <span className={`c-pill ${status === "Đã đăng" ? "is-ok" : "is-n"}`}>{status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="c-card c-einc">
          <div className="c-ch">
            <h2>Vòng lặp niềm tin</h2>
          </div>
          <div className="c-cb">
            <ol className="m-0 pl-5">
              <li>Giao và lắp tận nhà người nhận.</li>
              <li>Quay video bàn giao, gửi người đặt trong 24 giờ.</li>
              <li>Xin đánh giá sau 3 ngày sử dụng.</li>
              <li>Khách đồng ý thì dùng video làm quảng cáo cho người cùng tỉnh.</li>
              <li>Lead mới xem video khách thật, tin hơn, chốt nhanh hơn.</li>
            </ol>
            <div className="c-box-ai">
              <b>AI:</b> lead đã xem video bàn giao cùng tỉnh chốt cao gấp 2,4 lần lead chưa xem.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
