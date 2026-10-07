"use client";

import { ArrowLeft, Bot, Pin, Search, SendHorizontal, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CONV_STATUS, houseById } from "@/lib/demo/crm-data";
import { fold } from "@/lib/inbox/extract";
import { replyBlocker, visibleConvs } from "../access";
import { useShell } from "../shell-context";
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
  const { me, can } = useShell();
  // Lọc khách: nhanh theo trạng thái, theo nhân viên phụ trách, theo thẻ.
  const [view, setView] = useState<"all" | "need" | "mine" | "unassigned">("all");
  const [staff, setStaff] = useState("");
  const [tag, setTag] = useState("");
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
    .filter((x) =>
      view === "need"
        ? x.status === "need"
        : view === "mine"
          ? x.assignee === me
          : view === "unassigned"
            ? !x.assignee
            : true,
    )
    .filter((x) => !staff || x.assignee === staff)
    .filter((x) => !tag || x.tags.includes(tag))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const tagColor = (t: string) => state.convTags.find((x) => x.label === t)?.color ?? "#8e99a4";
  const staffNames = [...new Set([...state.receivers.filter((r) => r.active).map((r) => r.name), "My"])];
  const canAssign = can("lead.assign");
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
        <div className="cv-filters" role="group" aria-label="Lọc khách">
          {(
            [
              ["all", "Tất cả"],
              ["need", "Cần người"],
              ["mine", "Của tôi"],
              ["unassigned", "Chưa giao"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>
              {l}
              <span className="cv-fn">
                {
                  convs.filter((x) =>
                    k === "need"
                      ? x.status === "need"
                      : k === "mine"
                        ? x.assignee === me
                        : k === "unassigned"
                          ? !x.assignee
                          : true,
                  ).length
                }
              </span>
            </button>
          ))}
          <select aria-label="Lọc theo nhân viên" value={staff} onChange={(e) => setStaff(e.target.value)}>
            <option value="">Mọi nhân viên</option>
            {staffNames.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <select aria-label="Lọc theo thẻ" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Mọi thẻ</option>
            {state.convTags.map((t) => (
              <option key={t.label}>{t.label}</option>
            ))}
          </select>
        </div>
        {list.length === 0 ? <p className="cv-empty">Không có khách nào khớp bộ lọc.</p> : null}
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
                    <span className="cv-chips">
                      <span className={`cv-staff ${x.assignee ? "" : "is-none"}`}>
                        <UserRound size={11} aria-hidden />
                        {x.assignee ?? "Chưa giao"}
                      </span>
                      {x.tags.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="cv-tag"
                          style={{ "--t": tagColor(t) } as React.CSSProperties}
                        >
                          {t}
                        </span>
                      ))}
                      {x.tags.length > 2 ? (
                        <span className="cv-tag is-more">+{x.tags.length - 2}</span>
                      ) : null}
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
          {canAssign ? (
            <label className="tg-pill cv-assign">
              <UserRound size={15} aria-hidden />
              <select
                aria-label="Nhân viên phụ trách"
                value={c.assignee ?? ""}
                onChange={(e) => {
                  const to = e.target.value;
                  act(
                    { type: "assignConv", convId: c.id, to, actor: me },
                    to ? `Đã giao hội thoại cho ${to}` : "Đã trả hội thoại về Chưa giao",
                  );
                }}
              >
                <option value="">Chưa giao</option>
                {[...new Set([...staffNames, ...(c.assignee ? [c.assignee] : [])])].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          ) : c.assignee ? (
            <span className="tg-pill cv-assign">
              <UserRound size={15} aria-hidden /> {c.assignee} phụ trách
            </span>
          ) : canSend ? (
            <button
              type="button"
              className="tg-pill cv-hbtn"
              onClick={() =>
                act({ type: "assignConv", convId: c.id, to: me, actor: me }, "Đã nhận hội thoại")
              }
            >
              Nhận hội thoại
            </button>
          ) : null}
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
