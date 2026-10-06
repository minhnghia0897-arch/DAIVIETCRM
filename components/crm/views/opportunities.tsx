"use client";

import { Target } from "lucide-react";
import { useState } from "react";

import { STAGES, tr } from "@/lib/demo/crm-data";
import { LocTag, PageHead } from "../parts";
import { useShell } from "../shell";
import { useCrm } from "../store";
import { ImportPanel, NewLeadForm, SlaPill } from "./lead-intake";
import { LeadProfile } from "./lead-profile";

export function CrmOpportunities() {
  const { state, act } = useCrm();
  const { can, me } = useShell();
  const [panel, setPanel] = useState<"new" | "import" | null>(null);

  const all = can("lead.view_all");
  const opps = all ? state.opps : state.opps.filter((o) => o.owner === me);
  const sel = opps.find((o) => o.id === state.oppSel) ?? opps[0];
  const open = opps.filter((o) => o.stage < 5);

  return (
    <div className="c-stack c-flat">
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
          {can("lead.create") ? (
            <button
              type="button"
              className="c-btn is-blue"
              onClick={() => setPanel(panel === "new" ? null : "new")}
            >
              Tạo lead
            </button>
          ) : null}
          {can("lead.import") ? (
            <button
              type="button"
              className="c-btn"
              onClick={() => setPanel(panel === "import" ? null : "import")}
            >
              Nhập file
            </button>
          ) : null}
        </PageHead>
      </section>
      {panel === "new" ? <NewLeadForm onDone={() => setPanel(null)} /> : null}
      {panel === "import" ? <ImportPanel onDone={() => setPanel(null)} /> : null}

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
                  onClick={() => act({ type: "selectOpp", id: o.id })}
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
                    {(state.leadInfo[o.id]?.market ?? (o.city ? "KR" : "VN")) === "KR" ? (
                      <LocTag loc="KR" city={o.city || undefined} />
                    ) : (
                      <LocTag loc="VN" />
                    )}
                    {o.to ? ` → ${o.to}` : ""}
                  </div>
                  <div className="c-kf">
                    <span className="flex-1 truncate">{o.product.replace("Ghế massage ", "Ghế ")}</span>
                    <span className="tabular">{tr(o.value)}</span>
                  </div>
                  <div className="mt-1 empty:hidden">
                    <SlaPill oppId={o.id} />
                  </div>
                </button>
              ))}
            </section>
          );
        })}
      </div>

      {sel ? (
        <LeadProfile key={sel.id} opp={sel} />
      ) : (
        <p className="c-card c-empty">Chưa có cơ hội nào. Bấm Tạo lead để thêm khách mới.</p>
      )}
    </div>
  );
}
