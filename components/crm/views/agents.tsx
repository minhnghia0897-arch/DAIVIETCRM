"use client";

import { Bot } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { AGENTS, GLOBAL_RULES, agentById, traceSteps } from "@/lib/demo/crm-data";
import { AgentIcon, FeedList, PageHead } from "../parts";
import { useShell } from "../shell";
import { useCrm } from "../store";

// Agent: bật tắt từng agent, luật chung mọi agent phải theo, nhật ký quyết định có truy vết từng bước.
export function CrmAgents() {
  const { state, act } = useCrm();
  const { ask, can } = useShell();
  const trace = state.feed.find((f) => f.id === state.traceSel) ?? state.feed[0];

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead icon={Bot} color="var(--ai)" kicker="Tự động hóa có người duyệt" title="Agent">
          <span className="c-lbl">
            {AGENTS.filter((a) => state.agentOn[a.id]).length}/{AGENTS.length} đang bật · {state.autoCount}{" "}
            việc hôm nay
          </span>
          <button type="button" className="c-btn is-ai" onClick={() => ask("Agent nào cần chỉnh luật?")}>
            Hỏi AI
          </button>
        </PageHead>
      </section>

      <section className="c-card">
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Việc làm</th>
                <th>Luật riêng</th>
                <th className="text-right">Hôm nay</th>
                <th>Bật</th>
              </tr>
            </thead>
            <tbody>
              {AGENTS.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="flex items-center gap-2">
                      <AgentIcon id={a.id} size="sm" />
                      <b>{a.name}</b>
                    </span>
                  </td>
                  <td className="whitespace-normal">{a.desc}</td>
                  <td className="whitespace-normal c-lbl">{a.rules.join(" · ")}</td>
                  <td className="text-right tabular">{state.agentCount[a.id]}</td>
                  <td>
                    <Switch
                      label={a.name}
                      checked={state.agentOn[a.id]}
                      disabled={!can("settings.integrations")}
                      onCheckedChange={() =>
                        act(
                          { type: "toggleAgent", id: a.id },
                          `${state.agentOn[a.id] ? "Đã tắt" : "Đã bật"} ${a.name}`,
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="c-split">
        <section className="c-card">
          <div className="c-ch">
            <h2>Nhật ký quyết định</h2>
            <span className="c-r c-lbl">Bấm một dòng để xem truy vết</span>
          </div>
          <FeedList
            items={state.feed}
            limit={20}
            selected={trace?.id}
            onSelect={(id) => act({ type: "selectTrace", id })}
          />
        </section>
        <div className="c-stack">
          {trace ? (
            <section className="c-card c-einc" aria-label="Truy vết">
              <div className="c-ch">
                <AgentIcon id={trace.agent} size="sm" />
                <h2>Truy vết</h2>
                <span className="c-r c-lbl tabular">{trace.time}</span>
              </div>
              <div className="c-cb">
                <p className="mt-0">
                  <b>{agentById(trace.agent).name}:</b> {trace.text}
                </p>
                <ol className="c-trace">
                  {traceSteps(trace.agent, trace.time).map((s) => (
                    <li key={s.title}>
                      <b>{s.title}</b>
                      {s.text}
                      {s.ok?.map((o) => (
                        <span key={o} className="c-pill is-ok mr-1">
                          ✓ {o}
                        </span>
                      ))}
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          ) : null}
          <section className="c-card">
            <div className="c-ch">
              <h2>Luật chung</h2>
            </div>
            <div className="c-cb">
              <ol className="m-0 pl-5">
                {GLOBAL_RULES.map((r) => (
                  <li key={r} className="py-0.5">
                    {r}
                  </li>
                ))}
              </ol>
              <p className="c-lbl mt-2 mb-0">
                Luật nằm ở lớp nghiệp vụ, agent gọi cùng hàm như người nên không lách được.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
