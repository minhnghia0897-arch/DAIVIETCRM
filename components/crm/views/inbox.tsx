"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CHANNEL_COLOR, CONV_STATUS, houseById } from "@/lib/demo/crm-data";
import { replyBlocker, visibleConvs } from "../access";
import { useCrm } from "../store";
import { ConvSidePanel } from "./inbox-side";

const WHO = { cu: "Khách", ag: "Agent", hu: "Nhân viên" } as const;

// Hội thoại: danh sách theo kênh và trạng thái, khung chat, khung trợ lý bên phải (ý định, tóm tắt, câu trả lời gợi ý).
// Agent trả lời trước; tin cần người thì nhân viên tiếp quản. Mỗi kênh chỉ một nơi trả lời (CLAUDE.md 10.1).
export function CrmInbox() {
  const { state, act, who } = useCrm();
  const router = useRouter();
  const [text, setText] = useState("");
  const trs = useRef<HTMLDivElement>(null);
  // Không có `message.view_all` thì chỉ thấy hội thoại gắn lead mình được xem (CLAUDE.md mục 5).
  const convs = visibleConvs(state, who);
  const c = convs.find((x) => x.id === state.convSel) ?? convs[0];
  // Mỗi kênh chỉ một nơi trả lời: kênh đặt "trả lời ở công cụ khác" thì ô soạn chỉ đọc (CLAUDE.md 10.1, 11.2).
  const blocker = c ? replyBlocker(state, who, c.channel) : null;
  const canSend = Boolean(c) && !blocker;

  useEffect(() => {
    trs.current?.scrollTo({ top: trs.current.scrollHeight });
  }, [c?.messages.length, c?.id]);

  if (!c)
    return (
      <p className="c-card c-empty">
        Chưa có hội thoại nào gắn với khách anh chị đang phụ trách. Tin mới của khách sẽ hiện ở đây.
      </p>
    );

  const order = { need: 0, human: 1, agent: 2, done: 3 } as const;
  const pinned = (state.convNotes[c.id] ?? []).filter((n) => n.pinned);
  const list = [...convs].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <section className="c-card c-inbox" aria-labelledby="inbox-title">
      <h1 id="inbox-title" className="sr-only">
        Hội thoại
      </h1>
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
                className="c-btn is-blue"
                onClick={() => act({ type: "takeOver" }, `Đã tiếp quản hội thoại với ${c.name}`)}
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
        {pinned.length ? (
          <ul
            className="m-0 list-none border-b border-line-2 bg-warn-soft px-[14px] py-1.5"
            aria-label="Ghi chú đã ghim"
          >
            {pinned.map((n) => (
              <li key={n.id} className="text-[13px]">
                <b>Ghi chú:</b> {n.text} <span className="c-lbl">· {n.actor}</span>
              </li>
            ))}
          </ul>
        ) : null}
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
          <p className="c-reply c-lbl m-0">{blocker}.</p>
        )}
      </div>

      <ConvSidePanel key={c.id} conv={c} canSend={canSend} onPickReply={setText}>
        <h3>Ý định</h3>
        <p className="m-0">{c.intent}</p>
        <h3>AI tóm tắt</h3>
        <div className="c-aisum" style={{ marginTop: 0 }}>
          {c.summary}
        </div>
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
      </ConvSidePanel>
    </section>
  );
}
