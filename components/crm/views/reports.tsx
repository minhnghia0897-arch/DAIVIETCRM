"use client";

import { BarChart3 } from "lucide-react";

import { FUNNEL, GOAL, MONTH_PLAN, PRODUCT_MIX, tr, ty } from "@/lib/demo/crm-data";
import { PageHead } from "../parts";
import { useShell } from "../shell";
import { useCrm } from "../store";

const pct = (a: number, b: number) =>
  `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format((a / b) * 100)}%`;

// Báo cáo kinh doanh cơ bản: tiến độ mục tiêu theo tháng, phễu, thị trường người đặt, cơ cấu sản phẩm.
export function CrmReports() {
  const { state } = useCrm();
  const { can, ask } = useShell();
  const team = can("report.team");
  // Tháng 10 cộng phần doanh thu phát sinh trong phiên mô phỏng.
  const months = MONTH_PLAN.map(([m, plan, done], i) => [m, plan, i === 0 ? state.revenue : done] as const);
  const maxFunnel = FUNNEL[0][1];

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={BarChart3}
          color="var(--brand)"
          kicker={team ? "Cả showroom · quý IV" : "Của tôi · quý IV"}
          title="Báo cáo"
        >
          <button type="button" className="c-btn is-ai" onClick={() => ask("Tóm tắt báo cáo này")}>
            Hỏi AI
          </button>
        </PageHead>
        <div className="c-kpis">
          <div>
            <span className="c-lbl">Doanh thu đã cọc</span>
            <strong>{ty(state.revenue)}</strong>
          </div>
          <div>
            <span className="c-lbl">Tiến độ mục tiêu {ty(GOAL)}</span>
            <strong>{pct(state.revenue, GOAL)}</strong>
          </div>
          <div>
            <span className="c-lbl">Lead → đặt cọc (theo lô lead)</span>
            <strong>{pct(FUNNEL[4][1], FUNNEL[0][1])}</strong>
          </div>
          <div>
            <span className="c-lbl">Giá trị đơn trung bình</span>
            <strong>{tr(52.4)}</strong>
          </div>
        </div>
      </section>

      <div className="c-rgrid">
        <section className="c-card">
          <div className="c-ch">
            <h2>Kế hoạch theo tháng</h2>
          </div>
          <div className="c-cb">
            {months.map(([m, plan, done]) => (
              <div key={m} className="c-hbar" style={{ gridTemplateColumns: "70px 1fr 110px" }}>
                <span>{m}</span>
                <i>
                  <u
                    style={{ width: `${Math.min(100, (done / plan) * 100)}%`, background: "var(--brand)" }}
                  />
                </i>
                <span className="text-right tabular">
                  {tr(done)} / {tr(plan)}
                </span>
              </div>
            ))}
            <p className="c-lbl mt-2 mb-0">Tháng 12 gánh gần một nửa mục tiêu vì mùa quà Tết.</p>
          </div>
        </section>

        <section className="c-card">
          <div className="c-ch">
            <h2>Phễu lead (theo lô lead quý IV)</h2>
          </div>
          <div className="c-cb c-funnel">
            {FUNNEL.map(([label, n], i) => (
              <div key={label}>
                <div className="c-fb" style={{ width: `${Math.max(28, (n / maxFunnel) * 100)}%` }}>
                  {label}: {n}
                  {i > 0 ? (
                    <span className="ml-auto pl-2 font-normal opacity-85">{pct(n, FUNNEL[i - 1][1])}</span>
                  ) : null}
                </div>
              </div>
            ))}
            <div className="c-box-ai">
              <b>Nút thắt:</b> Đã liên hệ → Demo chỉ {pct(FUNNEL[2][1], FUNNEL[1][1])}. Video call là đòn bẩy
              lớn nhất.
            </div>
          </div>
        </section>

        <section className="c-card">
          <div className="c-ch">
            <h2>Doanh thu theo thị trường người đặt</h2>
          </div>
          <div className="c-cb">
            <div className="c-bar-stack" role="img" aria-label="Hàn Quốc 78%, Việt Nam 22%">
              <span style={{ width: "78%", background: "var(--loc-kr)" }} />
              <span style={{ width: "22%", background: "var(--loc-vn)" }} />
            </div>
            <div className="c-legend">
              <span style={{ "--c": "var(--loc-kr)" } as React.CSSProperties}>Người đặt ở Hàn Quốc 78%</span>
              <span style={{ "--c": "var(--loc-vn)" } as React.CSSProperties}>Người đặt trong nước 22%</span>
            </div>
            <p className="c-lbl mt-2 mb-0">Thị trường lấy từ hồ sơ khách do nhân viên xác nhận.</p>
          </div>
        </section>

        <section className="c-card">
          <div className="c-ch">
            <h2>Cơ cấu sản phẩm</h2>
          </div>
          <div className="c-cb">
            {PRODUCT_MIX.map(([name, v, tone]) => (
              <div key={name} className="c-hbar" style={{ gridTemplateColumns: "150px 1fr 40px" }}>
                <span>{name}</span>
                <i>
                  <u style={{ width: `${v * 2}%`, background: `var(--${tone})` }} />
                </i>
                <span className="text-right tabular">{v}%</span>
              </div>
            ))}
            <div className="c-box-ai">
              <b>AI:</b> 86% hộ mới mua một sản phẩm. Bán chéo máy lọc nước cho hộ đã có ghế là doanh thu rẻ
              nhất.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
