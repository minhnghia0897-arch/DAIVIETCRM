"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CHANNEL_COLOR, CONV_STATUS, houseById } from "@/lib/demo/crm-data";
import { useShell } from "../shell";
import { useCrm } from "../store";

const WHO = { cu: "Khách", ag: "Agent", hu: "Nhân viên" } as const;

// Hội thoại: danh sách theo kênh và trạng thái, khung chat, khung trợ lý bên phải (ý định, tóm tắt, câu trả lời gợi ý).
// Agent trả lời trước; tin cần người thì nhân viên tiếp quản. Mỗi kênh chỉ một nơi trả lời (CLAUDE.md 10.1).
export function CrmInbox() {
  const { state, act } = useCrm();
  const { can } = useShell();
  const router = useRouter();
  const [text, setText] = useState("");
  const trs = useRef<HTMLDivElement>(null);
  const c = state.convs.find((x) => x.id === state.convSel) ?? state.convs[0];
  // Mỗi kênh chỉ một nơi trả lời: kênh đặt "trả lời ở công cụ khác" thì ô soạn chỉ đọc (CLAUDE.md 10.1, 11.2).
  const channelKey = { Zalo: "zalo_oa", Facebook: "meta_messenger", "TikTok Live": "", Hotline: "" }[
    c.channel
  ];
  const mode = channelKey ? (state.settings.replyMode[channelKey] ?? "crm") : "crm";
  const canSend = can("message.zalo_send") && mode === "crm";

  useEffect(() => {
    trs.current?.scrollTo({ top: trs.current.scrollHeight });
  }, [c.messages.length, c.id]);

  const order = { need: 0, human: 1, agent: 2, done: 3 } as const;
  const list = [...state.convs].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <section className="c-card c-inbox" aria-label="Hội thoại">
      <div className="c-ibl" aria-label="Danh sách hội thoại">
        {list.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-current={x.id === c.id}
            onClick={() => {
              setText("");
              act({ type: "selectConv", id: x.id });
            }}
          >
            <div className="c-l1">
              <span
                className="inline-block size-2.5 flex-none rounded-full"
                style={{ background: CHANNEL_COLOR[x.channel] }}
                aria-hidden
              />
              <b>{x.name}</b>
              <span className="c-lbl tabular">{x.time}</span>
            </div>
            <div className="c-pv">{x.messages.at(-1)?.[1]}</div>
            <span className={`c-pill is-${CONV_STATUS[x.status].tone}`}>
              {CONV_STATUS[x.status].label}
            </span>{" "}
            <span className="c-lbl">
              {x.channel} · {x.location}
            </span>
          </button>
        ))}
      </div>

      <div className="c-conv">
        <div className="c-convh">
          <b>{c.name}</b>
          <span className="c-lbl">
            {c.channel} · {c.location}
          </span>
          <span className={`c-pill is-${CONV_STATUS[c.status].tone}`}>{CONV_STATUS[c.status].label}</span>
          {c.worried ? <span className="c-pill is-err">Khách lo ngại</span> : null}
          <span className="c-r">
            {canSend && (c.status === "need" || c.status === "agent") ? (
              <button
                type="button"
                className="c-btn is-brand"
                onClick={() => act({ type: "takeOver" }, `Bạn đã tiếp quản hội thoại với ${c.name}`)}
              >
                Tiếp quản
              </button>
            ) : null}
            {canSend && c.status !== "done" ? (
              <button
                type="button"
                className="c-btn"
                onClick={() => act({ type: "closeConv" }, "Đã đánh dấu xong")}
              >
                Đánh dấu xong
              </button>
            ) : null}
          </span>
        </div>
        <div className="c-trs" ref={trs}>
          {c.messages.map(([from, body, time], i) =>
            from === "sys" ? (
              <div key={i} className="c-sys">
                {body} · {time}
              </div>
            ) : (
              <div key={i} className={`c-bb is-${from}`}>
                <small>
                  {WHO[from]} · {time}
                </small>
                {body}
              </div>
            ),
          )}
        </div>
        {canSend ? (
          <form
            className="c-reply"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              act({ type: "reply", text: text.trim() }, "Đã gửi");
              setText("");
            }}
          >
            <textarea
              aria-label="Nội dung trả lời"
              placeholder={`Trả lời ${c.name} qua ${c.channel}…`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button type="submit" className="c-btn is-brand" disabled={!text.trim()}>
              Gửi
            </button>
          </form>
        ) : (
          <p className="c-reply c-lbl m-0">
            {mode === "external"
              ? "Kênh này đang được trả lời trên Pancake, CRM chỉ đọc."
              : mode === "off"
                ? "Kênh này đang tắt trong Cài đặt, Tích hợp."
                : "Bạn chỉ xem được hội thoại này."}
          </p>
        )}
      </div>

      <aside className="c-cop" aria-label="Trợ lý hội thoại">
        <h3>Ý định</h3>
        <p className="m-0">{c.intent}</p>
        <h3>AI tóm tắt</h3>
        <div className="c-aisum" style={{ marginTop: 0 }}>
          {c.summary}
        </div>
        {c.suggestions.length && canSend && c.status !== "done" ? (
          <>
            <h3>Câu trả lời gợi ý</h3>
            {c.suggestions.map((s) => (
              <button key={s} type="button" className="c-sr" onClick={() => setText(s)}>
                {s}
              </button>
            ))}
            <p className="c-lbl m-0">Bấm để đưa vào ô soạn, sửa rồi gửi.</p>
          </>
        ) : null}
        {c.houseId ? (
          <>
            <h3>Hồ sơ</h3>
            <button
              type="button"
              className="c-link"
              onClick={() => {
                act({ type: "selectHouse", id: c.houseId! });
                router.push("/households");
              }}
            >
              Mở hồ sơ {houseById(c.houseId)?.name}
            </button>
          </>
        ) : null}
      </aside>
    </section>
  );
}
