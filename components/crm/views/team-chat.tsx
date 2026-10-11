"use client";

import {
  ArrowLeft,
  Check,
  CheckCheck,
  CornerUpLeft,
  FileText,
  Hash,
  Heart,
  Image as ImageIcon,
  Info,
  Paperclip,
  Pin,
  Plus,
  Search,
  Send,
  X,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  MEMBER_COLOR,
  type ChatAttachment,
  type ChatMessage,
  type ChatTopic,
  type TeamChat,
} from "@/lib/demo/team-chat";
import { visibleChats } from "../access";
import { useShell } from "../shell-context";
import { maskPhonesInText, useCrm } from "../store";

// GIỮ LẠI, CHƯA DÙNG: hộp chat nội bộ do chính CRM lưu tin (DESIGN.md mục Nhóm nội bộ). Chờ duyệt bảng lưu tin
// và quyền riêng từng nhóm (docs/open-questions.md mục 28). Màn /chat hiện là màn kiểm soát nhóm Telegram
// (components/crm/views/telegram-groups.tsx), vì đội chat trên Telegram và CRM không đọc nội dung đó.
//
// Nhóm nội bộ của đội (giao diện kiểu Telegram): danh sách nhóm bên trái, mỗi nhóm nhiều chủ đề; khung chat nền
// họa tiết, bong bóng tin, trả lời trích dẫn, ảnh, tệp, liên kết, tin ghim, thích; khung thông tin nhóm gom ảnh,
// tệp, liên kết đã gửi. Số điện thoại khách gõ vào bị che trước khi gửi (CLAUDE.md mục 5).

const URL_RE = /(https?:\/\/[^\s]+)/g;
const TOKEN_RE = /(https?:\/\/[^\s]+|#Q4-\d{4}-\d{4}|@[\p{L}]+)/gu;

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function Avatar({ name, color, size = 42 }: { name: string; color?: string; size?: number }) {
  return (
    <span
      className="tg-av"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: color ?? MEMBER_COLOR[name] ?? "#8e99a4",
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

const lastOf = (c: TeamChat) =>
  c.topics
    .flatMap((t) => t.messages)
    .sort((a, b) => (a.day === b.day ? a.time.localeCompare(b.time) : a.day === "Hôm qua" ? -1 : 1))
    .at(-1);

const fmtSize = (n: number) =>
  n > 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

export function CrmTeamChat() {
  const { state, act, who } = useCrm();
  const { me } = useShell();
  const chats = visibleChats(state, who);
  const [sel, setSel] = useState<{ chat: string; topic: string }>(() => ({
    chat: chats[0]?.id ?? "",
    topic: chats[0]?.topics[0]?.id ?? "",
  }));
  const [mobileList, setMobileList] = useState(true);
  const [q, setQ] = useState("");
  const [info, setInfo] = useState(false);
  const chat = chats.find((c) => c.id === sel.chat) ?? chats[0];
  const topic = chat?.topics.find((t) => t.id === sel.topic) ?? chat?.topics[0];
  const unread = (c: TeamChat, t: ChatTopic) =>
    Math.max(0, t.messages.length - (state.chatSeen[`${c.id}/${t.id}`] ?? 0));

  // Đang mở chủ đề nào thì coi như đã đọc chủ đề đó.
  const opened = chat && topic ? `${chat.id}/${topic.id}` : "";
  const count = topic?.messages.length ?? 0;
  useEffect(() => {
    if (chat && topic) act({ type: "chatSeen", chatId: chat.id, topicId: topic.id });
  }, [opened, count, act, chat, topic]);

  if (!chat || !topic)
    return (
      <p className="c-card c-empty">
        Anh chị chưa ở trong nhóm nào. Owner hoặc quản lý sẽ thêm anh chị vào nhóm.
      </p>
    );

  const shown = chats.filter(
    (c) =>
      !q.trim() ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.topics.some((t) => t.name.toLowerCase().includes(q.toLowerCase())),
  );

  function open(c: TeamChat, t?: ChatTopic) {
    setSel({ chat: c.id, topic: (t ?? c.topics[0]).id });
    setMobileList(false);
  }

  return (
    <section
      className={`tg ${mobileList ? "is-list" : "is-chat"} ${info ? "has-info" : ""}`}
      aria-label="Nhóm nội bộ"
    >
      <h1 className="sr-only">Nhóm nội bộ</h1>
      <aside className="tg-side" aria-label="Danh sách nhóm">
        <div className="tg-side-h">
          <b>Nhóm nội bộ</b>
        </div>
        <label className="tg-search">
          <Search size={16} aria-hidden />
          <input
            aria-label="Tìm nhóm, chủ đề"
            placeholder="Tìm nhóm, chủ đề"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <ul className="tg-list">
          {shown.map((c) => {
            const last = lastOf(c);
            const total = c.topics.reduce((n, t) => n + unread(c, t), 0);
            const active = c.id === chat.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`tg-item ${active ? "is-on" : ""}`}
                  aria-current={active}
                  onClick={() => open(c)}
                >
                  <Avatar name={c.name} color={c.color} size={48} />
                  <span className="tg-item-b">
                    <span className="tg-item-r1">
                      <b>{c.name}</b>
                      <span className="tg-time">{last?.time}</span>
                    </span>
                    <span className="tg-item-r2">
                      <span className="tg-prev">
                        {last ? (
                          <>
                            <span className="tg-prev-from">{last.from === me ? "Anh chị" : last.from}: </span>
                            {last.attachment?.kind === "image" ? "Ảnh " : last.attachment ? "Tệp " : ""}
                            {last.text}
                          </>
                        ) : (
                          "Chưa có tin"
                        )}
                      </span>
                      {total ? <span className="tg-badge">{total}</span> : null}
                    </span>
                  </span>
                </button>
                {active && c.kind === "group" ? (
                  <TopicList chat={c} topic={topic} unread={(t) => unread(c, t)} onOpen={(t) => open(c, t)} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="tg-main">
        <header className="tg-head">
          <div className="tg-pill tg-head-l">
            <button
              type="button"
              className="tg-ib tg-mback"
              aria-label="Về danh sách nhóm"
              onClick={() => setMobileList(true)}
            >
              <ArrowLeft size={18} />
            </button>
            <Avatar name={chat.name} color={chat.color} size={38} />
            <span className="min-w-0">
              <b className="tg-title">
                {chat.name}
                {chat.kind === "group" ? (
                  <span className="tg-topic-name">
                    {" "}
                    <Hash size={14} aria-hidden /> {topic.name}
                  </span>
                ) : null}
              </b>
              <span className="tg-sub">
                {chat.kind === "channel" ? "Kênh thông báo" : "Nhóm"} · {chat.members.length} thành viên
              </span>
            </span>
          </div>
          <div className="tg-pill">
            <button
              type="button"
              className="tg-ib"
              aria-label="Thông tin nhóm"
              aria-pressed={info}
              onClick={() => setInfo((v) => !v)}
            >
              <Info size={19} />
            </button>
          </div>
        </header>
        <Conversation key={`${chat.id}/${topic.id}`} chat={chat} topic={topic} />
      </div>

      {info ? <InfoPanel chat={chat} onClose={() => setInfo(false)} /> : null}
    </section>
  );
}

function TopicList({
  chat,
  topic,
  unread,
  onOpen,
}: {
  chat: TeamChat;
  topic: ChatTopic;
  unread: (t: ChatTopic) => number;
  onOpen: (t: ChatTopic) => void;
}) {
  const { act } = useCrm();
  const { me } = useShell();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  return (
    <ul className="tg-topics" aria-label={`Chủ đề của ${chat.name}`}>
      {chat.topics.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            className={`tg-topic ${t.id === topic.id ? "is-on" : ""}`}
            aria-current={t.id === topic.id}
            onClick={() => onOpen(t)}
          >
            <span className="tg-topic-ic" style={{ background: t.color }} aria-hidden>
              <Hash size={13} />
            </span>
            <span className="tg-topic-n">{t.name}</span>
            {unread(t) ? <span className="tg-badge">{unread(t)}</span> : null}
          </button>
        </li>
      ))}
      <li>
        {adding ? (
          <form
            className="tg-topic-new"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              act(
                { type: "chatTopicCreate", chatId: chat.id, name, actor: me },
                `Đã tạo chủ đề "${name.trim()}"`,
              );
              setName("");
              setAdding(false);
            }}
          >
            <input
              autoFocus
              aria-label="Tên chủ đề mới"
              placeholder="Tên chủ đề, ví dụ Đơn Tết"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="tg-ib" aria-label="Tạo chủ đề">
              <Check size={16} />
            </button>
            <button type="button" className="tg-ib" aria-label="Hủy" onClick={() => setAdding(false)}>
              <X size={16} />
            </button>
          </form>
        ) : (
          <button type="button" className="tg-topic tg-topic-add" onClick={() => setAdding(true)}>
            <Plus size={15} aria-hidden /> Chủ đề mới
          </button>
        )}
      </li>
    </ul>
  );
}

/** Chữ trong tin: liên kết bấm được, mã đơn mở hồ sơ đơn, @tên tô đậm. */
function RichText({ text }: { text: string }) {
  const { state } = useCrm();
  const parts = text.split(TOKEN_RE);
  return (
    <>
      {parts.map((p, i) => {
        if (/^https?:\/\//.test(p))
          return (
            <a key={i} href={p} target="_blank" rel="noreferrer" className="tg-link">
              {p}
            </a>
          );
        if (/^#Q4-/.test(p)) {
          const o = state.orders.find((x) => x.code === p.slice(1));
          return o ? (
            <Link key={i} href={`/orders/${o.id}`} className="tg-link">
              {p}
            </Link>
          ) : (
            <Fragment key={i}>{p}</Fragment>
          );
        }
        if (/^@/.test(p))
          return (
            <span key={i} className="tg-mention">
              {p}
            </span>
          );
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

function Conversation({ chat, topic }: { chat: TeamChat; topic: ChatTopic }) {
  const { act } = useCrm();
  const { me } = useShell();
  const [text, setText] = useState("");
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [pending, setPending] = useState<ChatAttachment | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const canPost = chat.kind === "group" || chat.admins.includes(me);
  const isAdmin = chat.admins.includes(me);
  const byId = useMemo(() => new Map(topic.messages.map((m) => [m.id, m])), [topic.messages]);
  const pinned = topic.pinned ? byId.get(topic.pinned) : undefined;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [topic.messages.length]);

  function pick(kind: ChatAttachment["kind"], f: File | undefined) {
    if (!f) return;
    setPending({ kind, name: f.name, size: fmtSize(f.size), url: URL.createObjectURL(f) });
    setAttachMenu(false);
  }

  function send() {
    if (!text.trim() && !pending) return;
    act({
      type: "chatSend",
      chatId: chat.id,
      topicId: topic.id,
      text,
      replyTo: reply?.id,
      attachment: pending ?? undefined,
      actor: me,
    });
    setText("");
    setReply(null);
    setPending(null);
  }

  return (
    <>
      {pinned ? (
        <div className="tg-pinned" role="note" aria-label="Tin đã ghim">
          <Pin size={15} aria-hidden />
          <span className="min-w-0">
            <b>Tin đã ghim</b>
            <span className="tg-pinned-t">{pinned.text || pinned.attachment?.name}</span>
          </span>
          {isAdmin ? (
            <button
              type="button"
              className="tg-ib ml-auto"
              aria-label="Bỏ ghim"
              onClick={() =>
                act(
                  { type: "chatPin", chatId: chat.id, topicId: topic.id, msgId: null, actor: me },
                  "Đã bỏ ghim",
                )
              }
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="tg-msgs" ref={scroller} aria-label="Tin nhắn" role="log">
        {topic.messages.length === 0 ? (
          <p className="tg-day">
            <span>Chủ đề mới. Gửi tin đầu tiên cho {chat.name}.</span>
          </p>
        ) : null}
        {topic.messages.map((m, i) => {
          const mine = m.from === me;
          const next = topic.messages[i + 1];
          const tail = !next || next.from !== m.from || next.day !== m.day;
          const showDay = i === 0 || topic.messages[i - 1].day !== m.day;
          const quoted = m.replyTo ? byId.get(m.replyTo) : undefined;
          return (
            <Fragment key={m.id}>
              {showDay ? (
                <p className="tg-day">
                  <span>{m.day}</span>
                </p>
              ) : null}
              <div className={`tg-row ${mine ? "is-out" : "is-in"} ${tail ? "has-tail" : ""}`}>
                {!mine ? (
                  <span className="tg-row-av">{tail ? <Avatar name={m.from} size={34} /> : null}</span>
                ) : null}
                <div className="tg-bubble" aria-label={`Tin của ${m.from} lúc ${m.time}`}>
                  {!mine ? (
                    <b className="tg-from" style={{ color: MEMBER_COLOR[m.from] }}>
                      {m.from}
                    </b>
                  ) : null}
                  {quoted ? (
                    <div
                      className="tg-quote"
                      style={{ "--q": MEMBER_COLOR[quoted.from] ?? "#4fae4e" } as React.CSSProperties}
                    >
                      <b>{quoted.from}</b>
                      <span>{quoted.text || quoted.attachment?.name}</span>
                    </div>
                  ) : null}
                  {m.attachment?.kind === "image" && m.attachment.url ? (
                    <a href={m.attachment.url} target="_blank" rel="noreferrer" className="tg-img">
                      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh người dùng gửi, không tối ưu qua next/image */}
                      <img src={m.attachment.url} alt={m.attachment.name} />
                    </a>
                  ) : null}
                  {m.attachment?.kind === "file" ? (
                    <a
                      className="tg-file"
                      href={m.attachment.url ?? "#"}
                      download={m.attachment.url ? m.attachment.name : undefined}
                      onClick={(e) => !m.attachment?.url && e.preventDefault()}
                    >
                      <span className="tg-file-ic" aria-hidden>
                        <FileText size={20} />
                      </span>
                      <span className="min-w-0">
                        <b>{m.attachment.name}</b>
                        <span className="tg-sub">{m.attachment.size}</span>
                      </span>
                    </a>
                  ) : null}
                  {m.text ? (
                    <p className="tg-text">
                      <RichText text={m.text} />
                    </p>
                  ) : null}
                  <span className="tg-meta">
                    {m.likes?.length ? (
                      <button
                        type="button"
                        className="tg-like is-on"
                        aria-label={`Bỏ thích, ${m.likes.length} lượt thích`}
                        onClick={() =>
                          act({
                            type: "chatLike",
                            chatId: chat.id,
                            topicId: topic.id,
                            msgId: m.id,
                            actor: me,
                          })
                        }
                      >
                        <Heart size={13} fill="currentColor" aria-hidden />
                        {m.likes.length}
                      </button>
                    ) : null}
                    <span className="tg-time">{m.time}</span>
                    {mine ? <CheckCheck size={15} className="tg-read" aria-label="Đã gửi" /> : null}
                  </span>
                  <span className="tg-acts">
                    <button
                      type="button"
                      className="tg-ib"
                      aria-label="Trả lời"
                      title="Trả lời"
                      onClick={() => setReply(m)}
                    >
                      <CornerUpLeft size={15} />
                    </button>
                    <button
                      type="button"
                      className="tg-ib"
                      aria-label="Thích"
                      title="Thích"
                      onClick={() =>
                        act({ type: "chatLike", chatId: chat.id, topicId: topic.id, msgId: m.id, actor: me })
                      }
                    >
                      <Heart size={15} />
                    </button>
                    {isAdmin ? (
                      <button
                        type="button"
                        className="tg-ib"
                        aria-label="Ghim tin"
                        title="Ghim tin"
                        onClick={() =>
                          act(
                            { type: "chatPin", chatId: chat.id, topicId: topic.id, msgId: m.id, actor: me },
                            "Đã ghim tin",
                          )
                        }
                      >
                        <Pin size={15} />
                      </button>
                    ) : null}
                  </span>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      {canPost ? (
        <form
          className="tg-compose"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {reply || pending ? (
            <div className="tg-compose-ctx">
              {reply ? (
                <div
                  className="tg-quote"
                  style={{ "--q": MEMBER_COLOR[reply.from] ?? "#4fae4e" } as React.CSSProperties}
                >
                  <b>Trả lời {reply.from}</b>
                  <span>{reply.text || reply.attachment?.name}</span>
                </div>
              ) : null}
              {pending ? (
                <div className="tg-quote" style={{ "--q": "#3390ec" } as React.CSSProperties}>
                  <b>{pending.kind === "image" ? "Ảnh đính kèm" : "Tệp đính kèm"}</b>
                  <span>
                    {pending.name} · {pending.size}
                  </span>
                </div>
              ) : null}
              <button
                type="button"
                className="tg-ib"
                aria-label="Bỏ trả lời, đính kèm"
                onClick={() => (setReply(null), setPending(null))}
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          <div className="tg-compose-row">
            <span className="relative">
              <button
                type="button"
                className="tg-round"
                aria-label="Đính kèm"
                aria-expanded={attachMenu}
                onClick={() => setAttachMenu((v) => !v)}
              >
                <Paperclip size={20} />
              </button>
              {attachMenu ? (
                <span className="tg-attach-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => imageInput.current?.click()}>
                    <ImageIcon size={16} aria-hidden /> Ảnh
                  </button>
                  <button type="button" role="menuitem" onClick={() => fileInput.current?.click()}>
                    <FileText size={16} aria-hidden /> Tệp
                  </button>
                </span>
              ) : null}
              <input
                ref={imageInput}
                type="file"
                accept="image/*"
                hidden
                aria-label="Chọn ảnh"
                onChange={(e) => pick("image", e.target.files?.[0])}
              />
              <input
                ref={fileInput}
                type="file"
                hidden
                aria-label="Chọn tệp"
                onChange={(e) => pick("file", e.target.files?.[0])}
              />
            </span>
            <input
              className="tg-input"
              aria-label="Viết tin nhắn"
              placeholder="Viết tin nhắn…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="submit"
              className="tg-round tg-send"
              aria-label="Gửi"
              disabled={!text.trim() && !pending}
            >
              <Send size={19} />
            </button>
          </div>
          {maskPhonesInText(text) !== text ? (
            <p className="tg-warn">
              Số điện thoại sẽ được che khi gửi. Cần số khách thì mở hồ sơ lead trên CRM.
            </p>
          ) : null}
        </form>
      ) : (
        <p className="tg-readonly">Kênh thông báo: chỉ quản trị kênh đăng tin.</p>
      )}
    </>
  );
}

function InfoPanel({ chat, onClose }: { chat: TeamChat; onClose: () => void }) {
  const [tab, setTab] = useState<"image" | "file" | "link" | "members">("image");
  const all = chat.topics.flatMap((t) => t.messages.map((m) => ({ ...m, topic: t.name })));
  const images = all.filter((m) => m.attachment?.kind === "image" && m.attachment.url);
  const files = all.filter((m) => m.attachment?.kind === "file");
  const links = all.flatMap((m) => (m.text.match(URL_RE) ?? []).map((url) => ({ url, m })));
  const tabs: [typeof tab, string][] = [
    ["image", `Ảnh (${images.length})`],
    ["file", `Tệp (${files.length})`],
    ["link", `Liên kết (${links.length})`],
    ["members", `Thành viên (${chat.members.length})`],
  ];
  return (
    <aside className="tg-info" aria-label="Thông tin nhóm">
      <div className="tg-info-h">
        <b>Thông tin nhóm</b>
        <button type="button" className="tg-ib" aria-label="Đóng thông tin nhóm" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="tg-info-top">
        <Avatar name={chat.name} color={chat.color} size={72} />
        <b>{chat.name}</b>
        <span className="tg-sub">
          {chat.kind === "channel" ? "Kênh thông báo" : `${chat.topics.length} chủ đề`} ·{" "}
          {chat.members.length} thành viên
        </span>
      </div>
      <div className="c-ftabs" role="tablist" aria-label="Nội dung đã chia sẻ">
        {tabs.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className="c-ftab"
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="tg-info-b">
        {tab === "image" ? (
          images.length ? (
            <div className="tg-grid">
              {images.map((m) => (
                <a
                  key={m.id}
                  href={m.attachment!.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`${m.attachment!.name} · ${m.topic}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- ảnh người dùng gửi */}
                  <img src={m.attachment!.url} alt={m.attachment!.name} />
                </a>
              ))}
            </div>
          ) : (
            <p className="c-lbl">Chưa có ảnh nào được gửi.</p>
          )
        ) : null}
        {tab === "file" ? (
          files.length ? (
            <ul className="tg-flist">
              {files.map((m) => (
                <li key={m.id}>
                  <span className="tg-file-ic" aria-hidden>
                    <FileText size={18} />
                  </span>
                  <span className="min-w-0">
                    <b>{m.attachment!.name}</b>
                    <span className="tg-sub">
                      {m.attachment!.size} · {m.from} · {m.topic} · {m.day} {m.time}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="c-lbl">Chưa có tệp nào.</p>
          )
        ) : null}
        {tab === "link" ? (
          links.length ? (
            <ul className="tg-flist">
              {links.map(({ url, m }) => (
                <li key={`${m.id}${url}`}>
                  <span className="tg-file-ic is-link" aria-hidden>
                    {new URL(url).hostname[0]?.toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <a href={url} target="_blank" rel="noreferrer" className="tg-link">
                      {url}
                    </a>
                    <span className="tg-sub">
                      {m.from} · {m.topic} · {m.day} {m.time}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="c-lbl">Chưa có liên kết nào.</p>
          )
        ) : null}
        {tab === "members" ? (
          <ul className="tg-flist">
            {chat.members.map((n) => (
              <li key={n}>
                <Avatar name={n} size={36} />
                <span>
                  <b>{n}</b>
                  <span className="tg-sub">{chat.admins.includes(n) ? "Quản trị" : "Thành viên"}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}
