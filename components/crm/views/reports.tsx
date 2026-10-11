"use client";

import { BarChart3 } from "lucide-react";

import { FUNNEL, GOAL, MONTH_PLAN, PRODUCT_MIX, STAGES, tr, ty } from "@/lib/demo/crm-data";
import { PageHead } from "../parts";
import { useShell } from "../shell";
import { visibleOpps } from "../access";
import { useCrm } from "../store";

const pct = (a: number, b: number) =>
  `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format((a / b) * 100)}%`;

// Báo cáo kinh doanh cơ bản: tiến độ mục tiêu theo tháng, phễu, thị trường người đặt, cơ cấu sản phẩm.
export function CrmReports() {
  const { state, who } = useCrm();
  const { can, ask } = useShell();
  const team = can("report.team");
  // Chỉ có báo cáo của mình: số liệu tính từ lead mình giữ, không hiện doanh thu, phễu của cả showroom.
  const mine = visibleOpps(state, who).filter((o) => o.owner === who.me);
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
        {team ? null : (
          <div className="c-kpis">
            <div>
              <span className="c-lbl">Cơ hội đang mở</span>
              <strong>{mine.filter((o) => o.stage < 5).length}</strong>
            </div>
            <div>
              <span className="c-lbl">Pipeline</span>
              <strong>{tr(mine.filter((o) => o.stage < 4).reduce((t, o) => t + o.value, 0))}</strong>
            </div>
            <div>
              <span className="c-lbl">Đã cọc</span>
              <strong>{tr(mine.filter((o) => o.stage >= 4).reduce((t, o) => t + o.value, 0))}</strong>
            </div>
          </div>
        )}
        {team ? (
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
        ) : null}
      </section>

      {team ? (
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
                  <div className="c-fb" style={{ width: `${Math.max(42, (n / maxFunnel) * 100)}%` }}>
                    {label}: {n}
                    {i > 0 ? (
                      <span className="ml-auto pl-2 font-normal opacity-85">{pct(n, FUNNEL[i - 1][1])}</span>
                    ) : null}
                  </div>
                </div>
              ))}
              <div className="c-box-ai">
                <b>Nút thắt:</b> Đã liên hệ → Demo chỉ {pct(FUNNEL[2][1], FUNNEL[1][1])}. Video call là đòn
                bẩy lớn nhất.
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
                <span style={{ "--c": "var(--loc-kr)" } as React.CSSProperties}>
                  Người đặt ở Hàn Quốc 78%
                </span>
                <span style={{ "--c": "var(--loc-vn)" } as React.CSSProperties}>
                  Người đặt trong nước 22%
                </span>
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
      ) : null}
      <LeadReport />
    </div>
  );
}

/** Báo cáo lead tháng 1 (CLAUDE.md mục 2, 9): theo nguồn, gọi trong SLA, liên hệ được, phễu, từng telesale. */
function LeadReport() {
  const { state } = useCrm();
  const { can, me } = useShell();
  const team = can("report.team");
  const opps = team ? state.opps : state.opps.filter((o) => o.owner === me);
  const ids = new Set(opps.map((o) => o.id));
  const calls = state.activities.filter(
    (a) => ids.has(a.oppId) && (a.kind === "call" || a.kind === "zalo") && a.text.includes(" · "),
  );
  const reached = calls.filter((a) => /Nghe máy|quan tâm/.test(a.text) && !/không trả lời/.test(a.text));
  const timed = opps.filter(
    (o) =>
      state.leadMeta[o.id]?.slaDue !== undefined &&
      state.leadMeta[o.id].assignedAt !== undefined &&
      state.leadMeta[o.id].assignedAt! >= 0,
  );
  const inSla = timed.filter((o) => {
    const m = state.leadMeta[o.id];
    return m.firstContactAt !== undefined && m.firstContactAt <= m.slaDue!;
  });
  const overdue = timed.filter((o) => {
    const m = state.leadMeta[o.id];
    return m.firstContactAt === undefined ? m.slaDue! < state.minutes : m.firstContactAt > m.slaDue!;
  });
  const bySource = Object.entries(
    opps.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.source]: (acc[o.source] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const maxSource = Math.max(1, ...bySource.map(([, n]) => n));
  const people = [...new Set(opps.map((o) => o.owner || "Chưa phân"))];
  const pctText = (a: number, b: number) => (b ? pct(a, b) : "—");

  return (
    <section className="c-card" aria-label="Báo cáo lead">
      <div className="c-ch">
        <h2>Lead trong hệ thống</h2>
        <span className="c-r c-lbl">Tính trực tiếp từ lead và cuộc gọi đã ghi</span>
      </div>
      <div className="c-kpis">
        <div>
          <span className="c-lbl">Lead đang mở</span>
          <strong>{opps.filter((o) => o.stage < 5).length}</strong>
        </div>
        <div>
          <span className="c-lbl">Gọi trong SLA ({state.settings.slaMinutes} phút)</span>
          <strong>{pctText(inSla.length, timed.length)}</strong>
          <span className="c-lbl">
            {inSla.length}/{timed.length} lead mới
          </span>
        </div>
        <div>
          <span className="c-lbl">Quá hạn SLA</span>
          <strong className={overdue.length ? "text-err" : undefined}>{overdue.length}</strong>
        </div>
        <div>
          <span className="c-lbl">Tỷ lệ liên hệ được</span>
          <strong>{pctText(reached.length, calls.length)}</strong>
          <span className="c-lbl">
            {reached.length}/{calls.length} cuộc gọi đã ghi
          </span>
        </div>
      </div>
      <div className="c-rgrid c-cb" style={{ paddingTop: 12 }}>
        <div>
          <b>Lead theo nguồn</b>
          {bySource.map(([src, n]) => (
            <div key={src} className="c-hbar" style={{ gridTemplateColumns: "1fr 120px 28px" }}>
              <span>{src}</span>
              <i>
                <u style={{ width: `${(n / maxSource) * 100}%`, background: "var(--obj-lead)" }} />
              </i>
              <span className="text-right tabular">{n}</span>
            </div>
          ))}
        </div>
        <div>
          <b>Phễu giai đoạn hiện tại</b>
          {STAGES.map((st, i) => {
            const n = opps.filter((o) => o.stage === i).length;
            return (
              <div key={st} className="c-hbar" style={{ gridTemplateColumns: "1fr 120px 28px" }}>
                <span>{st}</span>
                <i>
                  <u
                    style={{ width: `${(n / Math.max(1, opps.length)) * 100}%`, background: "var(--brand)" }}
                  />
                </i>
                <span className="text-right tabular">{n}</span>
              </div>
            );
          })}
        </div>
      </div>
      {team ? (
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Người giữ</th>
                <th className="text-right">Lead đang giữ</th>
                <th className="text-right">Đã liên hệ</th>
                <th className="text-right">Quá SLA</th>
                <th className="text-right">Cuộc gọi đã ghi</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const mine = opps.filter((o) => (o.owner || "Chưa phân") === p);
                const mineIds = new Set(mine.map((o) => o.id));
                return (
                  <tr key={p}>
                    <td>
                      <b>{p}</b>
                    </td>
                    <td className="text-right tabular">{mine.length}</td>
                    <td className="text-right tabular">{mine.filter((o) => o.stage >= 1).length}</td>
                    <td className="text-right tabular">{overdue.filter((o) => mineIds.has(o.id)).length}</td>
                    <td className="text-right tabular">{calls.filter((a) => mineIds.has(a.oppId)).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="c-lbl px-4 py-2">
        Cuộc gọi ghi tay ở chế độ gọi ngoài hệ thống được tính riêng với cuộc gọi tổng đài xác nhận khi có
        tổng đài.
      </p>
    </section>
  );
}
