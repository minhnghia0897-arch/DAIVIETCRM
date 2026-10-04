"use client";

import { Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { STAGES, houseById, tr } from "@/lib/demo/crm-data";
import { LocTag, PageHead, Steps } from "../parts";
import { useShell } from "../shell";
import { useCrm } from "../store";

// Lý do thất bại mặc định (CLAUDE.md mục 6).
const LOST_REASONS = [
  "Giá cao",
  "Đã mua nơi khác",
  "Chưa tin mua từ xa",
  "Người nhận không muốn nhận",
  "Không giao được tới khu vực",
  "Hết nhu cầu, chỉ hỏi giá",
  "Không liên lạc được sau 5 lần",
  "Sai số, số ảo",
  "Trùng lead",
];

// Bước tiếp theo: hai bước đầu người chuyển tay; từ Báo giá trở đi chỉ sinh từ báo giá và đơn (CLAUDE.md mục 6),
// nên nút là hành động nghiệp vụ tương ứng chứ không phải kéo giai đoạn.
const NEXT_ACTION: { label: string; perm: string; toast: string }[] = [
  { label: "Chuyển sang Đã liên hệ", perm: "lead.edit_own", toast: "Đã chuyển sang Đã liên hệ" },
  { label: "Chuyển sang Demo, video call", perm: "lead.edit_own", toast: "Đã chuyển sang Demo, video call" },
  { label: "Gửi báo giá", perm: "quote.create", toast: "Đã gửi báo giá, cơ hội sang Báo giá" },
  { label: "Ghi nhận đặt cọc", perm: "payment.record", toast: "Đã ghi nhận đặt cọc" },
  { label: "Tạo phiếu giao lắp", perm: "order.edit_own", toast: "Đã tạo phiếu giao lắp" },
];

export function CrmOpportunities() {
  const { state, act } = useCrm();
  const { can, me, ask } = useShell();
  const router = useRouter();
  const [losing, setLosing] = useState(false);
  const [reason, setReason] = useState(LOST_REASONS[0]);

  const all = can("lead.view_all");
  const opps = all ? state.opps : state.opps.filter((o) => o.owner === me);
  const sel = opps.find((o) => o.id === state.oppSel) ?? opps[0];
  const open = opps.filter((o) => o.stage < 5);
  const canEdit = (owner: string) => can("lead.edit_all") || (can("lead.edit_own") && owner === me);

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={Target}
          color="var(--obj-lead)"
          kicker={all ? "Toàn showroom" : "Cơ hội của tôi"}
          title="Cơ hội"
        >
          <span className="c-lbl">
            {open.length} đang mở · pipeline <b>{tr(open.reduce((s, o) => s + o.value, 0))}</b>
          </span>
        </PageHead>
      </section>

      <div className="c-kb" aria-label="Bảng cơ hội theo giai đoạn">
        {STAGES.map((stage, i) => {
          const col = opps.filter((o) => o.stage === i);
          return (
            <section key={stage} className="c-col" aria-label={stage}>
              <div className="c-colh">
                <b>{stage}</b>
                <span className="c-lbl">
                  {col.length} · {tr(col.reduce((s, o) => s + o.value, 0))}
                </span>
              </div>
              {col.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`c-kc ${sel?.id === o.id ? "is-sel" : ""}`}
                  aria-pressed={sel?.id === o.id}
                  onClick={() => {
                    setLosing(false);
                    act({ type: "selectOpp", id: o.id });
                  }}
                >
                  <div className="c-kt">
                    <b className="truncate">{o.name}</b>
                    <span
                      className={`c-pill ${o.score >= 75 ? "is-ok" : o.score >= 55 ? "is-warn" : "is-n"}`}
                    >
                      {o.score}
                    </span>
                  </div>
                  <div className="c-lbl">
                    {o.city ? <LocTag loc="KR" city={o.city} /> : <LocTag loc="VN" />} → {o.to}
                  </div>
                  <div className="c-kf">
                    <span className="flex-1 truncate">{o.product.replace("Ghế massage ", "Ghế ")}</span>
                    <span className="tabular">{tr(o.value)}</span>
                  </div>
                </button>
              ))}
            </section>
          );
        })}
      </div>

      {sel ? (
        <section className="c-card" aria-label={`Cơ hội ${sel.name}`}>
          <div className="c-ch">
            <h2>{sel.name}</h2>
            {sel.city ? <LocTag loc="KR" city={sel.city} /> : <LocTag loc="VN" />}
            <span className="c-r">
              <span className="c-pill is-n">{STAGES[sel.stage]}</span>
            </span>
          </div>
          <div className="c-cb">
            <Steps labels={STAGES} current={sel.stage} />
            <div className="c-hl" style={{ borderTop: 0, padding: "0 0 8px" }}>
              <div>
                <span className="c-lbl">Sản phẩm</span>
                <b>{sel.product}</b>
              </div>
              <div>
                <span className="c-lbl">Giá trị</span>
                <b className="tabular">{tr(sel.value)}</b>
              </div>
              <div>
                <span className="c-lbl">Giao tới</span>
                <b>{sel.to}</b>
              </div>
              <div>
                <span className="c-lbl">Dịp</span>
                <b>{sel.occasion || "Dùng cho gia đình"}</b>
              </div>
              <div>
                <span className="c-lbl">Nguồn</span>
                <b>{sel.source}</b>
              </div>
              <div>
                <span className="c-lbl">Phụ trách</span>
                <b>{sel.owner}</b>
              </div>
            </div>
            <div className="c-box-ai">
              <b>AI gợi ý bước tiếp:</b> {sel.next}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {sel.stage < 5 && canEdit(sel.owner) && can(NEXT_ACTION[sel.stage].perm) ? (
                <button
                  type="button"
                  className="c-btn is-brand"
                  onClick={() => act({ type: "advanceOpp" }, NEXT_ACTION[sel.stage].toast)}
                >
                  {NEXT_ACTION[sel.stage].label}
                </button>
              ) : null}
              {sel.houseId ? (
                <button
                  type="button"
                  className="c-btn"
                  onClick={() => {
                    act({ type: "selectHouse", id: sel.houseId! });
                    router.push("/households");
                  }}
                >
                  Mở hồ sơ {houseById(sel.houseId)?.name}
                </button>
              ) : null}
              <button
                type="button"
                className="c-btn"
                onClick={() => ask("Gợi ý bước tiếp cho cơ hội đang chọn")}
              >
                Hỏi AI
              </button>
              {sel.stage < 4 && can("lead.mark_lost") && canEdit(sel.owner) ? (
                <button type="button" className="c-btn" onClick={() => setLosing((v) => !v)}>
                  Đánh dấu thất bại
                </button>
              ) : null}
            </div>
            {losing ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-control bg-err-soft p-2.5">
                <label htmlFor="lost-reason" className="font-semibold text-err">
                  Lý do thất bại
                </label>
                <select
                  id="lost-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="rounded-control border border-line bg-surface px-2 py-1"
                >
                  {LOST_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="c-btn"
                  style={{ color: "var(--err)" }}
                  onClick={() => {
                    setLosing(false);
                    act({ type: "loseOpp" }, `Đã đánh thất bại: ${reason}. Hẹn gọi lại đã lên lịch được hủy`);
                  }}
                >
                  Xác nhận thất bại
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="c-card c-empty">Chưa có cơ hội nào.</p>
      )}
    </div>
  );
}
