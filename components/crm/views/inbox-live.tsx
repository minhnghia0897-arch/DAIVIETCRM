"use client";

import { AlertCircle, ArrowLeft, Clock, ExternalLink, Paperclip, Search, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { useLiveChanges } from "@/lib/db/use-live-changes";
import { fold } from "@/lib/inbox/extract";
import type { Attachment } from "@/lib/integrations/attachments";
import { replyWindow, timeLeft } from "@/lib/integrations/meta_messenger/window";
import { zaloWindow } from "@/lib/integrations/zalo_oa/window";

import { ConvAvatar } from "./conv-avatar";

// Hội thoại chung mọi kênh trên bản thật (CLAUDE.md 10.3, 10.4, 10.5): Messenger và Zalo OA trong một danh sách.
// Messenger: trả lời trong 24 giờ, tới 7 ngày chỉ nhân viên trả lời tay (thẻ Human Agent). Zalo: miễn phí 48 giờ,
// ngoài đó vẫn gửi được nhưng tính phí theo hạn mức gói OA nên phải xác nhận. Luật thật kiểm ở database; giao diện chỉ
// hiện đồng hồ và nhắc. Tin mới đến qua Supabase Realtime.

type Result = { ok: boolean; message: string };
type Channel = "messenger" | "zalo";

const CH: Record<Channel, { label: string; avatar: "Facebook" | "Zalo" }> = {
  messenger: { label: "Messenger", avatar: "Facebook" },
  zalo: { label: "Zalo", avatar: "Zalo" },
};

export interface LiveConv {
  id: string;
  channel: Channel;
  name: string;
  lastAt: string | null;
  lastInboundAt: string | null;
  unread: number;
  preview: { out: boolean; text: string } | null;
  leadId: string | null;
  holder: string | null;
  mine: boolean;
}

export interface LiveThread {
  id: string;
  messages: {
    id: string;
    out: boolean;
    text: string | null;
    media: Attachment[];
    at: string;
    status: "received" | "queued" | "sent" | "failed";
    error: string | null;
    by: string | null;
    /** "Trả lời tay" (Messenger ngoài 24 giờ), "Tin tính phí" (Zalo ngoài 48 giờ). */
    tag: string | null;
  }[];
}

const time = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
});
const day = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
});
const vnDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

function when(iso: string | null, now: Date) {
  if (!iso) return "";
  return vnDate(iso) === vnDate(now.toISOString()) ? time.format(new Date(iso)) : day.format(new Date(iso));
}

export function InboxLive({
  convs,
  selectedId,
  thread,
  blockers,
  paidThisMonth,
  send,
  markRead,
}: {
  convs: LiveConv[];
  selectedId: string | null;
  thread: LiveThread | null;
  /** Lý do không trả lời được trên CRM theo kênh (chế độ trả lời, quyền…); null là được. */
  blockers: Record<Channel, string | null>;
  /** Tin Zalo tính phí đã gửi trong tháng. */
  paidThisMonth: number;
  send: (input: { conversationId: string; text: string; confirm: boolean }) => Promise<Result>;
  markRead: (input: { conversationId: string }) => Promise<void>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"all" | "unread" | "mine">("all");
  const [channel, setChannel] = useState<"" | Channel>("");
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => new Date());
  const msgs = useRef<HTMLDivElement>(null);
  const c = convs.find((x) => x.id === selectedId) ?? null;

  // Tin mới của khách: Realtime báo khi hội thoại, tin nhắn đổi (RLS chỉ gửi dòng mình được xem) rồi tải lại từ
  // server; không hỏi lại định kỳ cho đỡ tốn lượt gọi. Đồng hồ khung giờ chạy mỗi 30 giây.
  useLiveChanges("inbox", [{ table: "messages" }, { table: "conversations" }], () => router.refresh());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    msgs.current?.scrollTo({ top: msgs.current.scrollHeight });
  }, [thread?.messages.length, thread?.id]);

  // Mở hội thoại có tin chưa đọc thì đánh dấu đã đọc.
  const unread = c?.unread ?? 0;
  useEffect(() => {
    if (c && unread > 0) void markRead({ conversationId: c.id }).then(() => router.refresh());
  }, [c?.id, unread, markRead, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = convs
    .filter((x) => !q.trim() || fold(x.name).includes(fold(q.trim())))
    .filter((x) => (view === "unread" ? x.unread > 0 : view === "mine" ? x.mine : true))
    .filter((x) => !channel || x.channel === channel);
  const win = c?.channel === "messenger" ? replyWindow(c.lastInboundAt, now) : null;
  const zwin = c?.channel === "zalo" ? zaloWindow(c.lastInboundAt, now) : null;
  const blocker = c ? blockers[c.channel] : null;
  // Cần xác nhận trước khi gửi: Messenger ngoài 24 giờ (trả lời tay), Zalo ngoài 48 giờ (tin tính phí).
  const needConfirm = win?.mode === "human_agent" || zwin?.mode === "paid";
  const closed = win?.mode === "closed" || zwin?.mode === "closed";

  function open(id: string) {
    setText("");
    setConfirm(false);
    router.push(`/inbox?c=${id}`);
  }

  // Chặn gửi trùng: Enter có thể bấm lại (hoặc bộ gõ tiếng Việt bắn Enter hai lần) khi tin trước còn đang gửi.
  // Xóa ô soạn ngay khi bấm gửi, gửi lỗi thì trả lại chữ cho người dùng sửa.
  const sending = useRef(false);
  function submit() {
    if (!c || !text.trim() || sending.current) return;
    sending.current = true;
    const body = text;
    setText("");
    start(async () => {
      try {
        const r = await send({ conversationId: c.id, text: body, confirm });
        if (r.ok) setConfirm(false);
        else {
          setText((cur) => cur || body);
          toast(r.message, "err");
        }
        router.refresh();
      } finally {
        sending.current = false;
      }
    });
  }

  if (convs.length === 0)
    return (
      <section className="c-card" aria-labelledby="inbox-title">
        <h1 id="inbox-title" className="sr-only">
          Hội thoại
        </h1>
        <p className="c-empty">
          Chưa có hội thoại Messenger, Zalo nào gắn với khách anh chị đang phụ trách. Tin mới của khách sẽ
          hiện ở đây.
        </p>
      </section>
    );

  return (
    <section className={`tg cv cv-2 ${c ? "is-chat" : "is-list"}`} aria-labelledby="inbox-title">
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
              ["all", "Tất cả", convs.length],
              ["unread", "Chưa đọc", convs.filter((x) => x.unread > 0).length],
              ["mine", "Của tôi", convs.filter((x) => x.mine).length],
            ] as const
          ).map(([k, l, n]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>
              {l}
              <span className="cv-fn">{n}</span>
            </button>
          ))}
          <select
            aria-label="Lọc theo kênh"
            value={channel}
            onChange={(e) => setChannel(e.target.value as "" | Channel)}
          >
            <option value="">Mọi kênh</option>
            <option value="messenger">Messenger</option>
            <option value="zalo">Zalo</option>
          </select>
        </div>
        {list.length === 0 ? <p className="cv-empty">Không có khách nào khớp bộ lọc.</p> : null}
        <ul className="tg-list" aria-label="Danh sách hội thoại">
          {list.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                className={`tg-item ${x.id === c?.id ? "is-on" : ""}`}
                aria-current={x.id === c?.id}
                onClick={() => open(x.id)}
              >
                <ConvAvatar c={{ name: x.name, channel: CH[x.channel].avatar }} />
                <span className="tg-item-b">
                  <span className="tg-item-r1">
                    <b>{x.name}</b>
                    <span className="tg-time">{when(x.lastAt, now)}</span>
                  </span>
                  <span className="tg-item-r2">
                    <span className="tg-prev">
                      {x.preview?.out ? <span className="tg-prev-from">Mình: </span> : null}
                      {x.preview?.text}
                    </span>
                    {x.unread > 0 ? (
                      <span className="tg-badge" aria-label={`${x.unread} tin chưa đọc`}>
                        {x.unread}
                      </span>
                    ) : null}
                  </span>
                  <span className="cv-meta">
                    {CH[x.channel].label} · {x.holder ? `${x.holder} giữ lead` : "Chưa giao"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="tg-main">
        {!c || !thread ? (
          <p className="tg-readonly">Chọn một hội thoại ở bên trái để đọc và trả lời.</p>
        ) : (
          <>
            <div className="tg-head">
              <div className="tg-pill tg-head-l">
                <button
                  type="button"
                  className="tg-ib tg-mback"
                  aria-label="Về danh sách hội thoại"
                  onClick={() => router.push("/inbox")}
                >
                  <ArrowLeft size={18} />
                </button>
                <ConvAvatar c={{ name: c.name, channel: CH[c.channel].avatar }} size={38} />
                <span className="min-w-0">
                  <b className="tg-title">{c.name}</b>
                  <span className="tg-sub">
                    {CH[c.channel].label} · {c.holder ? `${c.holder} giữ lead` : "Chưa giao"}
                    {win ? (
                      <span
                        className={`cv-st ${win.mode === "response" ? "is-ok" : win.mode === "human_agent" ? "is-warn" : "is-err"}`}
                      >
                        {" · "}
                        {win.mode === "response"
                          ? `Khung 24 giờ ${timeLeft(win.endsAt, now)}`
                          : win.mode === "human_agent"
                            ? `Hết khung 24 giờ, trả lời tay ${timeLeft(win.endsAt, now)}`
                            : "Đã hết khung nhắn tin"}
                      </span>
                    ) : null}
                    {zwin ? (
                      <span
                        className={`cv-st ${zwin.mode === "free" ? "is-ok" : zwin.mode === "paid" ? "is-warn" : "is-err"}`}
                      >
                        {" · "}
                        {zwin.mode === "free"
                          ? `Miễn phí ${timeLeft(zwin.endsAt, now)}`
                          : zwin.mode === "paid"
                            ? "Ngoài 48 giờ, tin tính phí"
                            : "Khách chưa nhắn OA"}
                      </span>
                    ) : null}
                  </span>
                </span>
              </div>
              {c.leadId ? (
                <Link className="tg-pill cv-hbtn" href={`/leads/${c.leadId}`}>
                  <ExternalLink size={15} aria-hidden /> Mở hồ sơ lead
                </Link>
              ) : null}
            </div>

            <div className="tg-msgs" ref={msgs} role="log" aria-label="Tin nhắn">
              {thread.messages.map((m, i) => {
                const next = thread.messages[i + 1];
                const tail = !next || next.out !== m.out;
                return (
                  <div
                    key={m.id}
                    className={`tg-row ${m.out ? "is-out" : "is-in"} ${tail ? "has-tail" : ""}`}
                  >
                    {!m.out ? (
                      <span className="tg-row-av">
                        {tail ? (
                          <ConvAvatar c={{ name: c.name, channel: CH[c.channel].avatar }} size={34} />
                        ) : null}
                      </span>
                    ) : null}
                    <div className="tg-bubble cv-msg">
                      {m.out && m.by ? <b className="tg-from">{m.by}</b> : null}
                      {m.text ? <p className="tg-text">{m.text}</p> : null}
                      {m.media.length ? <MessageMedia items={m.media} channel={CH[c.channel].label} /> : null}
                      {m.status === "failed" ? (
                        <p className="tg-text text-err" role="alert">
                          <AlertCircle size={13} aria-hidden /> Chưa gửi được: {m.error}
                        </p>
                      ) : null}
                      <span className="tg-meta">
                        {m.tag ? <span className="tg-time">{m.tag} · </span> : null}
                        <span className="tg-time">{when(m.at, now)}</span>
                        {m.out ? (
                          <span className="tg-read">
                            {m.status === "sent" ? (
                              "✓"
                            ) : m.status === "queued" ? (
                              <Clock size={12} aria-label="Đang gửi" />
                            ) : (
                              ""
                            )}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {blocker ? (
              <p className="tg-readonly">{blocker}.</p>
            ) : closed ? (
              <p className="tg-readonly">
                {c.channel === "zalo"
                  ? "Khách chưa nhắn cho OA nên chưa gửi được tin tư vấn. Gọi điện hoặc mời khách nhắn OA."
                  : "Đã quá 7 ngày sau tin cuối của khách, Messenger không cho nhắn nữa. Gọi điện hoặc chờ khách nhắn lại."}
              </p>
            ) : (
              <form
                className="tg-compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                {needConfirm ? (
                  <label className="flex items-start gap-2 px-2 pb-1 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={confirm}
                      onChange={(e) => setConfirm(e.target.checked)}
                    />
                    <span>
                      {c.channel === "zalo"
                        ? `Gửi tin tính phí (ngoài 48 giờ, trừ vào hạn mức gói OA; tháng này đã gửi ${paidThisMonth} tin tính phí).`
                        : "Tôi tự trả lời đúng việc khách đã hỏi (thẻ Human Agent). Không gửi tin khuyến mãi, tin tự động."}
                    </span>
                  </label>
                ) : null}
                <div className="tg-compose-row">
                  <textarea
                    aria-label="Nội dung trả lời"
                    placeholder={`Trả lời ${c.name} qua ${CH[c.channel].label}…`}
                    value={text}
                    rows={1}
                    maxLength={2000}
                    className="tg-input cv-input"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="tg-round tg-send"
                    aria-label="Gửi"
                    disabled={!text.trim() || pending || (needConfirm && !confirm)}
                  >
                    <SendHorizontal size={20} />
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </section>
  );
}

const MEDIA_LABEL: Record<Attachment["kind"], string> = {
  image: "Ảnh",
  sticker: "Nhãn dán",
  video: "Video",
  audio: "Tin thoại",
  file: "Tệp",
  other: "Tệp đính kèm",
};

// Ảnh hiện ngay trong khung chat (bấm để mở to); video, tin thoại, tệp hiện thành link mở. Link của Meta, Zalo hết hạn
// sau một thời gian: ảnh không tải được thì báo xem trên kênh gốc.
function MessageMedia({ items, channel }: { items: Attachment[]; channel: string }) {
  return (
    <div className="cv-media">
      {items.map((a, i) =>
        a.url && (a.kind === "image" || a.kind === "sticker") ? (
          <MediaImage key={i} url={a.url} label={MEDIA_LABEL[a.kind]} channel={channel} />
        ) : (
          <p key={i} className="tg-text c-lbl">
            <Paperclip size={13} aria-hidden /> {a.name ?? MEDIA_LABEL[a.kind]}
            {a.url ? (
              <>
                {" · "}
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline">
                  Mở
                </a>
              </>
            ) : (
              <>, xem trên {channel}</>
            )}
          </p>
        ),
      )}
    </div>
  );
}

function MediaImage({ url, label, channel }: { url: string; label: string; channel: string }) {
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <p className="tg-text c-lbl">
        <Paperclip size={13} aria-hidden /> {label} đã hết hạn xem trên CRM, xem trên {channel}
      </p>
    );
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="cv-media-img">
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh từ máy chủ Meta, Zalo, không qua bộ tối ưu ảnh */}
      <img
        src={url}
        alt={`${label} khách gửi`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    </a>
  );
}
