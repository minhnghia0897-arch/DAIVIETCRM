"use client";

import { ArrowLeft, Bot, Pin, Search, SendHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CONV_STATUS, houseById } from "@/lib/demo/crm-data";
import { fold } from "@/lib/inbox/extract";
import { replyBlocker, visibleConvs } from "../access";
import { useCrm } from "../store";
import { ConvAvatar } from "./conv-avatar";
import { ConvSidePanel } from "./inbox-side";

// Hội thoại với khách, giao diện kiểu Telegram (dùng chung bộ .tg-* với Nhóm nội bộ): danh sách bên trái, khung chat
// nền xanh có bong bóng, cột phải để lên đơn, ghi chú, gợi ý của AI. Agent trả lời trước; tin cần người thì nhân viên
// tiếp quản. Mỗi kênh chỉ một nơi trả lời (CLAUDE.md 10.1).

const ORDER = { need: 0, human: 1, agent: 2, done: 3 } as const;

export function CrmInbox() {
  const { state, act, who } = useCrm();
  const router = useRouter();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  // Điện thoại: mở danh sách trước, chạm vào khách mới vào khung chat (như Telegram). Màn rộng không dùng cờ này.
  const [mobileList, setMobileList] = useState(true);
  const msgs = useRef<HTMLDivElement>(null);
  // Không có `message.view_all` thì chỉ thấy hội thoại gắn lead mình được xem (CLAUDE.md mục 5).
  const convs = visibleConvs(state, who);
  const c = convs.find((x) => x.id === state.convSel) ?? convs[0];
  // Mỗi kênh chỉ một nơi trả lời: kênh đặt "trả lời ở công cụ khác" thì ô soạn chỉ đọc (CLAUDE.md 10.1, 11.2).
  const blocker = c ? replyBlocker(state, who, c.channel) : null;
  const canSend = Boolean(c) && !blocker;

  useEffect(() => {
    msgs.current?.scrollTo({ top: msgs.current.scrollHeight });
  }, [c?.messages.length, c?.id]);

  if (!c)
    return (
      <p className="c-card c-empty">
        Chưa có hội thoại nào gắn với khách anh chị đang phụ trách. Tin mới của khách sẽ hiện ở đây.
      </p>
    );

  const pinned = (state.convNotes[c.id] ?? []).filter((n) => n.pinned);
  const list = [...convs]
    .filter((x) => !q.trim() || fold(x.name).includes(fold(q.trim())))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const status = CONV_STATUS[c.status];

  return (
    <section className={`tg cv ${mobileList ? "is-list" : "is-chat"}`} aria-labelledby="inbox-title">
      <h1 id="inbox-title" className="sr-only">
        Hội thoại
      </h1>

      <div className="tg-side">
        <div className="tg-side-h">
          <b>Hội thoại với khách</b>
        </div>
        <label className="tg-search">
          <Search size={17} aria-hidden />
          <input
            aria-label="Tìm hội thoại"
            placeholder="Tìm khách"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <ul className="tg-list" aria-label="Danh sách hội thoại">
          {list.map((x) => {
            const last = x.messages.filter(([f]) => f !== "sys").at(-1);
            const st = CONV_STATUS[x.status];
            return (
              <li key={x.id}>
                <button
                  type="button"
                  className={`tg-item ${x.id === c.id ? "is-on" : ""}`}
                  aria-current={x.id === c.id}
                  onClick={() => {
                    setText("");
                    setMobileList(false);
                    act({ type: "selectConv", id: x.id });
                  }}
                >
                  <ConvAvatar c={x} />
                  <span className="tg-item-b">
                    <span className="tg-item-r1">
                      <b>{x.name}</b>
                      <span className="tg-time">{x.time}</span>
                    </span>
                    <span className="tg-item-r2">
                      <span className="tg-prev">
                        {last ? (
                          <span className="tg-prev-from">
                            {last[0] === "cu" ? "" : last[0] === "ag" ? "Agent: " : "Mình: "}
                          </span>
                        ) : null}
                        {last?.[1]}
                      </span>
                      {x.status === "need" ? (
                        <span className="tg-badge cv-need" title={st.label}>
                          Cần người
                        </span>
                      ) : null}
                    </span>
                    <span className="cv-meta">
                      {x.channel} · {x.location}
                      {x.status !== "need" ? ` · ${st.label}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="tg-main">
        <div className="tg-head">
          <div className="tg-pill tg-head-l">
            <button
              type="button"
              className="tg-ib tg-mback"
              aria-label="Về danh sách hội thoại"
              onClick={() => setMobileList(true)}
            >
              <ArrowLeft size={18} />
            </button>
            <ConvAvatar c={c} size={38} />
            <span className="min-w-0">
              <b className="tg-title">{c.name}</b>
              <span className="tg-sub">
                {c.channel} · {c.location} · <span className={`cv-st is-${status.tone}`}>{status.label}</span>
                {c.worried ? <span className="cv-st is-err"> · Khách lo ngại</span> : null}
              </span>
            </span>
          </div>
          {canSend && (c.status === "need" || c.status === "agent") ? (
            <button
              type="button"
              className="tg-pill cv-hbtn is-blue"
              onClick={() => act({ type: "takeOver" }, `Đã tiếp quản hội thoại với ${c.name}`)}
            >
              Tiếp quản
            </button>
          ) : null}
          {canSend && c.status !== "done" ? (
            <button
              type="button"
              className="tg-pill cv-hbtn"
              onClick={() => act({ type: "closeConv" }, "Đã đánh dấu xong")}
            >
              Đánh dấu xong
            </button>
          ) : null}
        </div>

        {pinned.length ? (
          <div className="tg-pinned">
            <Pin size={15} aria-hidden className="flex-none" />
            <ul className="m-0 min-w-0 flex-1 list-none p-0" aria-label="Ghi chú đã ghim">
              {pinned.map((n) => (
                <li key={n.id}>
                  <b>Ghi chú của {n.actor}</b>
                  <span className="tg-pinned-t">{n.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="tg-msgs" ref={msgs} role="log" aria-label="Tin nhắn">
          {c.messages.map(([from, body, time], i) => {
            if (from === "sys")
              return (
                <div key={i} className="tg-day cv-sys">
                  <span>
                    {body} · {time}
                  </span>
                </div>
              );
            const out = from !== "cu";
            const next = c.messages[i + 1];
            const tail = !next || next[0] !== from;
            return (
              <div key={i} className={`tg-row ${out ? "is-out" : "is-in"} ${tail ? "has-tail" : ""}`}>
                {!out ? (
                  <span className="tg-row-av">{tail ? <ConvAvatar c={c} size={34} /> : null}</span>
                ) : null}
                <div className={`tg-bubble cv-msg ${from === "ag" ? "is-agent" : ""}`}>
                  {from === "ag" ? (
                    <b className="tg-from cv-agent">
                      <Bot size={14} aria-hidden /> Agent AI
                    </b>
                  ) : null}
                  <p className="tg-text">{body}</p>
                  <span className="tg-meta">
                    <span className="tg-time">{time}</span>
                    {out ? <span className="tg-read">✓✓</span> : null}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {canSend ? (
          <form
            className="tg-compose"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              act({ type: "reply", text: text.trim() }, "Đã gửi");
              setText("");
            }}
          >
            <div className="tg-compose-row">
              <textarea
                aria-label="Nội dung trả lời"
                placeholder={`Trả lời ${c.name} qua ${c.channel}…`}
                value={text}
                rows={1}
                className="tg-input cv-input"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button type="submit" className="tg-round tg-send" aria-label="Gửi" disabled={!text.trim()}>
                <SendHorizontal size={20} />
              </button>
            </div>
          </form>
        ) : (
          <p className="tg-readonly">{blocker}.</p>
        )}
      </div>

      <ConvSidePanel key={c.id} conv={c} canSend={canSend} onPickReply={setText}>
        <div className="cv-card">
          <h3>Ý định</h3>
          <p className="m-0">{c.intent}</p>
        </div>
        <div className="cv-card is-ai">
          <h3>
            <Bot size={15} aria-hidden /> AI tóm tắt
          </h3>
          <p className="m-0">{c.summary}</p>
        </div>
        {c.houseId ? (
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
        ) : null}
      </ConvSidePanel>
    </section>
  );
}
