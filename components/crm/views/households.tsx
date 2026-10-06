"use client";

import { Home, Sparkles } from "lucide-react";

import { tr } from "@/lib/demo/crm-data";
import { KindIcon, LocTag } from "../parts";
import { useShell } from "../shell";
import { visibleHouses } from "../access";
import { useCrm } from "../store";

// Hộ gia đình (hồ sơ khách 360 theo hộ): thành viên và vai trò, vì sao gộp, bán chéo, dòng thời gian,
// sản phẩm đang dùng, ngày quan trọng, niềm tin. Số điện thoại luôn ở dạng che.
export function CrmHouseholds() {
  const { state, act, who } = useCrm();
  const { can, ask } = useShell();
  const houses = visibleHouses(state, who);
  const h = houses.find((x) => x.id === state.houseSel) ?? houses[0];

  if (!h)
    return <p className="c-card c-empty">Chưa có hộ gia đình nào thuộc khách anh chị đang phụ trách.</p>;

  return (
    <div className="c-c360">
      <section className="c-card" aria-label="Danh sách hộ">
        <div className="c-ch">
          <h2>Hộ gia đình</h2>
          <span className="c-r">
            <span className="c-pill is-n">{houses.length}</span>
          </span>
        </div>
        <ul className="c-hlist">
          {houses.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                aria-current={x.id === h.id}
                onClick={() => act({ type: "selectHouse", id: x.id })}
              >
                <span className="c-oi" style={{ background: "var(--obj-contact)" }} aria-hidden>
                  <Home />
                </span>
                <span className="min-w-0">
                  <b>{x.name}</b>
                  <span className="c-lbl block">{x.place}</span>
                  <span className="c-lbl block">
                    {x.members.length} người · gắn kết {x.engagement}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="c-stack">
        <section className="c-card">
          <div className="c-phd">
            <span
              className="c-oi is-lg"
              style={{ "--c": "var(--obj-contact)" } as React.CSSProperties}
              aria-hidden
            >
              <Home />
            </span>
            <div className="c-t">
              <small>Hộ gia đình</small>
              <h1 className="m-0">
                <b>{h.name}</b>
              </h1>
            </div>
            <div className="c-r">
              <button type="button" className="c-btn is-ai" onClick={() => ask("Tóm tắt hộ gia đình này")}>
                <Sparkles size={13} className="mr-1 inline" aria-hidden />
                Tóm tắt bằng AI
              </button>
              {can("message.zalo_send") ? (
                <button type="button" className="c-btn" onClick={() => ask("Soạn tin cho người đặt ở Hàn")}>
                  Soạn tin
                </button>
              ) : null}
            </div>
          </div>
          <div className="c-hl">
            <div>
              <span className="c-lbl">Nơi ở</span>
              <b>{h.place}</b>
            </div>
            <div>
              <span className="c-lbl">Đã mua</span>
              <b className="tabular">{h.value ? tr(h.value) : "Chưa có"}</b>
            </div>
            <div>
              <span className="c-lbl">Mức gắn kết</span>
              <b className="tabular">{h.engagement}/100</b>
            </div>
            <div>
              <span className="c-lbl">Thành viên</span>
              <b>{h.members.length}</b>
            </div>
          </div>
        </section>

        <section className="c-card">
          <div className="c-ch">
            <h2>Thành viên</h2>
          </div>
          <div className="c-cb">
            <div className="c-fam">
              {h.members.map((m) => (
                <div key={m.name} className={`c-mem ${m.role === "Người đặt" ? "is-payer" : ""}`}>
                  <div className="flex items-center gap-1.5">
                    <b className="flex-1">{m.name}</b>
                    <LocTag loc={m.loc} />
                  </div>
                  <div className="c-lbl">{m.rel}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className={`c-pill ${m.role === "Người đặt" ? "is-ai" : "is-n"}`}>{m.role}</span>
                  </div>
                  <div className="mt-1 text-[13px]">{m.city}</div>
                  <div className="c-lbl tabular">{m.phone}</div>
                  {m.channels ? <div className="c-lbl">Kênh: {m.channels}</div> : null}
                </div>
              ))}
            </div>
            <div className="c-box-ai">
              <b>Vì sao là một hộ:</b> {h.why.join("; ")}.
            </div>
          </div>
        </section>

        <section className="c-card c-einc">
          <div className="c-ch">
            <h2>Cơ hội trong hộ</h2>
            <span className="c-pill is-ai">AI đề xuất</span>
          </div>
          <div className="c-cb">
            {h.cross.map((c, i) => {
              const done = state.crossDone.includes(`${h.id}:${i}`);
              return (
                <div key={c.title} className="c-nba">
                  <h3>
                    {c.title} <span className="c-lbl tabular">· {tr(c.value)}</span>
                  </h3>
                  <p>{c.detail}</p>
                  {done ? (
                    <span className="c-pill is-ok">Đã tạo cơ hội</span>
                  ) : can("lead.create") ? (
                    <button
                      type="button"
                      className="c-btn is-blue"
                      onClick={() =>
                        act(
                          { type: "createCross", houseId: h.id, index: i },
                          `Đã tạo cơ hội cho ${c.to}, phân theo luật cho người đang trực`,
                        )
                      }
                    >
                      Tạo cơ hội
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <div className="c-rgrid">
          <section className="c-card">
            <div className="c-ch">
              <h2>Dòng thời gian</h2>
            </div>
            <ul className="c-tl">
              {h.timeline.map((t) => (
                <li key={t.date + t.title}>
                  <KindIcon kind={t.kind} />
                  <div>
                    <div className="c-tt">{t.title}</div>
                    <div className="c-sd">{t.who}</div>
                    {t.ai ? (
                      <div className="c-aisum">
                        <b>AI:</b> {t.ai}
                      </div>
                    ) : null}
                  </div>
                  <span className="c-dt">{t.date}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="c-stack">
            <section className="c-card">
              <div className="c-ch">
                <h2>Đang sở hữu</h2>
              </div>
              <div className="c-cb">
                {h.owned.length ? (
                  <table className="c-rl">
                    <tbody>
                      {h.owned.map(([name, when, warranty]) => (
                        <tr key={name}>
                          <td>
                            <b>{name}</b>
                            <div className="c-lbl">{when}</div>
                          </td>
                          <td className="c-lbl">{warranty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="c-lbl m-0">Chưa mua sản phẩm nào.</p>
                )}
              </div>
            </section>
            <section className="c-card">
              <div className="c-ch">
                <h2>Ngày quan trọng</h2>
              </div>
              <div className="c-cb">
                <table className="c-rl">
                  <tbody>
                    {h.dates.map(([d, label]) => (
                      <tr key={d}>
                        <td>{label}</td>
                        <td>
                          <b>{d}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="c-card">
              <div className="c-ch">
                <h2>Niềm tin</h2>
              </div>
              <div className="c-cb">
                <ul className="m-0 list-disc pl-5">
                  {h.trust.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
