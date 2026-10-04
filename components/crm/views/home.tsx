"use client";

import { Gauge } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { tokenDaysLeft } from "@/lib/integrations/connection";
import { integrations } from "@/lib/integrations/registry";
import { DAYS_LEFT, GOAL, OCCASIONS, TEAM, tr, ty } from "@/lib/demo/crm-data";
import { ApprovalList, Avatar, FeedList, LocTag, PageHead } from "../parts";
import { useShell } from "../shell";
import { fmtMinutes, simDate, useCrm } from "../store";
import { AssignSelect, SlaPill, slaStats } from "./lead-intake";

const TEAM_COLORS = ["#0176D3", "#E07A2E", "#7526E3", "#0B827C", "#C23934", "#3E4A59"];

// Trang chủ theo bản mẫu: mục tiêu quý, chỉ số trong ngày, nhật ký agent, hàng gọi, chờ duyệt, dịp tặng.
export function CrmHome() {
  const { state, act } = useCrm();
  const { can, me: owner } = useShell();
  const router = useRouter();
  const sla = slaStats(state);
  const openLead = (id: string) => {
    act({ type: "selectOpp", id });
    router.push("/opportunities");
  };
  const team = can("lead.view_all");
  const pct = Math.min(100, (state.revenue / GOAL) * 100);
  // Mốc kỳ vọng: số ngày đã qua của quý / tổng số ngày quý.
  const expected = ((92 - DAYS_LEFT) / 92) * 100;
  const calls = state.opps
    .filter((o) => o.owner && o.stage <= 1 && (team || o.owner === owner))
    // Lead mới chưa liên hệ (đang chạy SLA) lên đầu, sau đó theo điểm.
    .sort(
      (a, b) =>
        Number(b.stage === 0) - Number(a.stage === 0) ||
        (state.leadMeta[a.id]?.slaDue ?? 1e9) - (state.leadMeta[b.id]?.slaDue ?? 1e9) ||
        b.score - a.score,
    );

  // Đấu nối lỗi hoặc token sắp hết hạn: báo trên trang chủ sale admin và Owner (CLAUDE.md 11.2).
  const integrationAlerts =
    team || can("settings.integrations")
      ? integrations.flatMap((d) => {
          const st = state.settings.integrationStates[d.key];
          if (!st) return [];
          if (st.status === "error") return [`${d.name} đang lỗi`];
          const days = tokenDaysLeft(st, simDate(state.minutes));
          return st.status === "connected" && days !== null && days < 3
            ? [`${d.name}: token còn ${Math.max(0, days)} ngày`]
            : [];
        })
      : [];

  return (
    <div className="c-stack">
      {integrationAlerts.length ? (
        <p
          role="alert"
          aria-label="Cảnh báo đấu nối"
          className="m-0 rounded-control bg-err-soft px-3 py-2 text-err"
        >
          {integrationAlerts.join(" · ")}.{" "}
          {can("settings.integrations") ? (
            <Link href="/settings/integrations" className="underline">
              Mở Tích hợp để xử lý
            </Link>
          ) : (
            "Báo Owner kiểm tra ở Cài đặt, Tích hợp. Lead có thể chưa vào CRM trong lúc này."
          )}
        </p>
      ) : null}
      <section className="c-card">
        <PageHead icon={Gauge} color="var(--brand)" kicker="Quý IV/2026 · Showroom Quận 4" title="Trang chủ">
          <span className="c-lbl">
            Cập nhật lúc <b className="tabular">{fmtMinutes(state.minutes)}</b>
          </span>
        </PageHead>
        <div className="c-cb">
          <div className="c-goalrow">
            <div>
              <div className="c-lbl">Doanh thu đã cọc</div>
              <div className="c-gnum">{ty(state.revenue)}</div>
            </div>
            <div className="c-gside">
              <span className="c-lbl">Mục tiêu quý</span>
              <b>{ty(GOAL)}</b>
            </div>
            <div className="c-gside">
              <span className="c-lbl">Còn lại</span>
              <b>{ty(GOAL - state.revenue)}</b>
            </div>
            <div className="c-gside">
              <span className="c-lbl">Cần mỗi ngày</span>
              <b>{tr((GOAL - state.revenue) / DAYS_LEFT)}</b>
            </div>
          </div>
          <div
            className="c-gbar"
            role="progressbar"
            aria-label="Tiến độ mục tiêu quý"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${pct}%` }} />
            <span className="c-gmark" style={{ left: `${expected}%` }} title="Mốc kỳ vọng hôm nay" />
          </div>
          <div className="c-lbl">
            Đạt {pct.toFixed(1).replace(".", ",")}% · vạch đen là mốc nên đạt hôm nay ({expected.toFixed(0)}%)
            · còn {DAYS_LEFT} ngày
          </div>
        </div>
        <div className="c-kpis">
          <div>
            <span className="c-lbl">Lead hôm nay</span>
            <strong>{state.leadsToday}</strong>
          </div>
          <div>
            <span className="c-lbl">Việc agent tự làm</span>
            <strong>{state.autoCount}</strong>
          </div>
          <div>
            <span className="c-lbl">Chờ người duyệt</span>
            <strong className={state.queue.length ? "text-warn" : undefined}>{state.queue.length}</strong>
          </div>
          <div>
            <span className="c-lbl">Cơ hội đang mở</span>
            <strong>{state.opps.filter((o) => o.stage < 5).length}</strong>
          </div>
        </div>
      </section>

      <div className="c-g84">
        <div className="c-stack">
          {team ? (
            <section className="c-card">
              <div className="c-ch">
                <h2>Việc của đội hôm nay</h2>
                <span className="c-r">
                  <Link href="/team" className="c-link text-label">
                    Đội ngũ
                  </Link>
                </span>
              </div>
              <div className="c-team">
                {TEAM.map((m, i) => (
                  <div key={m.id} className="c-tm">
                    <Avatar name={m.name} color={TEAM_COLORS[i % TEAM_COLORS.length]} />
                    <div className="min-w-0 flex-1">
                      <b>{m.name}</b> <span className="c-lbl">· {m.role}</span>
                      <div className="text-[13px] text-text-weak">{m.task}</div>
                    </div>
                    <span className="c-pill is-n">{m.count} việc</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="c-card">
            <div className="c-ch">
              <h2>Agent đang làm</h2>
              <span className="c-r">
                <span className={`c-pill ${state.paused ? "is-warn" : "is-ok"}`}>
                  {state.paused ? "Đang tạm dừng" : "Đang chạy"}
                </span>
              </span>
            </div>
            <FeedList items={state.feed} limit={8} />
          </section>

          <section className="c-card">
            <div className="c-ch">
              <h2>Dịp tặng quà sắp tới</h2>
            </div>
            <div className="c-tw">
              <table className="c-table">
                <thead>
                  <tr>
                    <th>Dịp</th>
                    <th>Còn</th>
                    <th>Hộ phù hợp</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {OCCASIONS.map(([date, name, left, who]) => {
                    const done = state.occasionsDone.includes(date);
                    return (
                      <tr key={date}>
                        <td>
                          <b>{date}</b> <span className="c-lbl">{name}</span>
                        </td>
                        <td>{left}</td>
                        <td className="whitespace-normal">{who}</td>
                        <td className="text-right">
                          {done ? (
                            <span className="c-pill is-ok">Agent đã nhận</span>
                          ) : can("lead.assign") ? (
                            <button
                              type="button"
                              className="c-btn is-ai"
                              onClick={() =>
                                act(
                                  { type: "assignOccasion", label: date },
                                  `Đã giao chiến dịch ${date} cho agent`,
                                )
                              }
                            >
                              Giao agent
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="c-stack">
          <section className="c-card">
            <div className="c-ch">
              <h2>{team ? "Hàng gọi của đội" : "Hàng chờ gọi của tôi"}</h2>
              <span className="c-r">
                <span className="c-pill is-n">{calls.length}</span>
              </span>
            </div>
            <div className="c-team">
              {calls.length === 0 ? <p className="c-empty">Không còn ai cần gọi.</p> : null}
              {calls.map((o) => (
                <div key={o.id} className="c-cq">
                  <div className="min-w-0 flex-1">
                    <b>{o.name}</b> {o.city ? <LocTag loc="KR" city={o.city} /> : <LocTag loc="VN" />}{" "}
                    <SlaPill oppId={o.id} />
                    <div className="c-lbl">
                      {o.product.replace("Ghế massage ", "Ghế ")} · {o.source} · điểm {o.score}
                    </div>
                  </div>
                  {can("call.make") ? (
                    <button type="button" className="c-btn" onClick={() => openLead(o.id)}>
                      Mở và gọi
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {team ? (
            <section className="c-card" aria-label="Lead cần điều phối">
              <div className="c-ch">
                <h2>Lead cần điều phối</h2>
                <span className="c-r">
                  <span className={`c-pill ${sla.overdue.length ? "is-err" : "is-n"}`}>
                    Quá SLA {sla.overdue.length}
                  </span>
                  <span className={`c-pill ${sla.unassigned.length ? "is-warn" : "is-n"}`}>
                    Chưa phân {sla.unassigned.length}
                  </span>
                </span>
              </div>
              <div className="c-team">
                {[...sla.overdue, ...sla.unassigned, ...sla.waiting].length === 0 ? (
                  <p className="c-empty">Không có lead quá hạn hay chưa phân.</p>
                ) : null}
                {[...sla.overdue, ...sla.unassigned, ...sla.waiting].map((o) => (
                  <div key={o.id} className="c-cq flex-wrap">
                    <div className="min-w-0 flex-1">
                      <button type="button" className="c-link font-semibold" onClick={() => openLead(o.id)}>
                        {o.name}
                      </button>{" "}
                      <SlaPill oppId={o.id} />
                      <div className="c-lbl">
                        {o.source}
                        {o.owner ? ` · đang giữ: ${o.owner}` : ""}
                      </div>
                    </div>
                    <AssignSelect oppId={o.id} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="c-card">
            <div className="c-ch">
              <h2>Chờ duyệt</h2>
              <span className="c-r">
                <span className="c-pill is-warn">{state.queue.length}</span>
              </span>
            </div>
            <ApprovalList items={state.queue.slice(0, 4)} />
          </section>
        </div>
      </div>
    </div>
  );
}
