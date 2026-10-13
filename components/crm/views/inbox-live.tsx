"use client";

import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCheck,
  Clock,
  ExternalLink,
  Paperclip,
  Pin,
  Search,
  RotateCcw,
  SendHorizontal,
  UserPlus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import { useLiveChanges } from "@/lib/db/use-live-changes";
import { fold } from "@/lib/inbox/extract";
import type { Attachment } from "@/lib/integrations/attachments";
import { replyWindow, timeLeft } from "@/lib/integrations/meta_messenger/window";
import { zaloWindow } from "@/lib/integrations/zalo_oa/window";

import { ConvAvatar } from "./conv-avatar";
import { InboxLiveSide, type LiveSide } from "./inbox-live-side";

// Hội thoại chung mọi kênh trên bản thật (CLAUDE.md 10.3, 10.4, 10.5): Messenger và Zalo OA trong một danh sách.
// Messenger: trả lời trong 24 giờ, tới 7 ngày chỉ nhân viên trả lời tay (thẻ Human Agent). Zalo: miễn phí 48 giờ,
// ngoài đó vẫn gửi được nhưng tính phí theo hạn mức gói OA nên phải xác nhận. Luật thật kiểm ở database; giao diện chỉ
// hiện đồng hồ và nhắc. Tin mới đến qua Supabase Realtime.
// Chuyển hội thoại tức thì như Pancake: bấm là đổi ngay (đổi địa chỉ bằng history, không tải lại trang), tin và cột
// phải lấy từ bộ nhớ tạm trên máy nếu đã mở hoặc đã tải sẵn (rê chuột, chạm, 3 hội thoại đầu), đồng thời tải bản mới
// qua app/api/inbox/thread. Bản trang vẽ lại (sau khi lưu, khi Realtime báo) luôn được ưu tiên nếu mới hơn.

type Result = { ok: boolean; message: string };
type Channel = "messenger" | "zalo";
/** Tin và cột phải của một hội thoại trong bộ nhớ tạm; `ver` tăng mỗi lần ghi để bản mới hơn thắng. */
type Entry = { thread: LiveThread; side: LiveSide | null; ver: number };
type Store = { ver: number; map: Record<string, Entry> };

/** Tải lại hội thoại đang có trong bộ nhớ tạm khi đã quá lâu hoặc Realtime báo có thay đổi. */
const FRESH_MS = 15_000;
/** Số hội thoại tải sẵn cùng lúc tối đa. */
const MAX_INFLIGHT = 3;

const CH: Record<Channel, { label: string; avatar: "Facebook" | "Zalo" }> = {
  messenger: { label: "Messenger", avatar: "Facebook" },
  zalo: { label: "Zalo", avatar: "Zalo" },
};

export interface LiveConv {
  id: string;
  channel: Channel;
  name: string;
  /** Ảnh đại diện kênh gửi về (Messenger), link https; null thì hiện chữ cái đầu. */
  avatar: string | null;
  lastAt: string | null;
  lastInboundAt: string | null;
  unread: number;
  preview: { out: boolean; text: string } | null;
  leadId: string | null;
  contactId: string | null;
  holderId: string | null;
  holder: string | null;
  mine: boolean;
  /** Nhân viên đã đánh dấu xong; khách nhắn lại thì tự mở. */
  done: boolean;
  tagIds: string[];
  /** Trợ lý AI: "on" đang tự trả lời, "paused" đã dừng ở hội thoại này, null là kênh chưa bật AI. */
  ai: "on" | "paused" | null;
  /** Lý do AI dừng: takeover (Tiếp quản), handoff (AI chuyển), staff_reply (nhân viên tự gửi), existing. */
  aiPause: string | null;
}

export interface LiveTag {
  id: string;
  label: string;
  color: string;
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
    /** Tin do Trợ lý AI gửi. */
    ai: boolean;
  }[];
  /** Lần AI chuyển cho người gần nhất: lý do, tóm tắt nhu cầu cho nhân viên. */
  handoff: { reason: string; summary: string | null; at: string } | null;
}

/** Vì sao AI dừng ở hội thoại (hiện cạnh tên khách). */
const AI_PAUSE: Record<string, string> = {
  takeover: "Nhân viên đã tiếp quản",
  handoff: "AI đã chuyển cho nhân viên",
  staff_reply: "Nhân viên đang trả lời",
  existing: "Nhân viên đang trả lời",
};

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
// Dùng lại một bộ định dạng: toLocaleDateString tạo bộ mới mỗi lần, chậm khi danh sách có hàng trăm dòng.
const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const vnDate = (iso: string) => ymd.format(new Date(iso));

function when(iso: string | null, now: Date) {
  if (!iso) return "";
  return vnDate(iso) === vnDate(now.toISOString()) ? time.format(new Date(iso)) : day.format(new Date(iso));
}

export function InboxLive({
  convs,
  selectedId,
  thread,
  side = null,
  blockers,
  paidThisMonth,
  send,
  markRead,
  tags = [],
  assignees = null,
  assign,
  setDone,
  toggleTag,
  createTag,
  assignConv,
  qualify,
  aiSwitch,
}: {
  convs: LiveConv[];
  selectedId: string | null;
  thread: LiveThread | null;
  /** Cột phải (hồ sơ khách, ghi chú); null khi chưa chọn hội thoại hoặc hội thoại chưa gắn khách. */
  side?: LiveSide | null;
  /** Lý do không trả lời được trên CRM theo kênh (chế độ trả lời, quyền…); null là được. */
  blockers: Record<Channel, string | null>;
  /** Tin Zalo tính phí đã gửi trong tháng. */
  paidThisMonth: number;
  send: (input: { conversationId: string; text: string; confirm: boolean }) => Promise<Result>;
  markRead: (input: { conversationId: string }) => Promise<void>;
  /** Danh mục thẻ của showroom. */
  tags?: LiveTag[];
  /** Người nhận lead được (null khi không có quyền giao lead). */
  assignees?: { id: string; name: string }[] | null;
  assign?: (input: {
    leadIds: string[];
    assigneeId: string | null;
    assigneeName?: string;
    reason?: string;
  }) => Promise<Result>;
  setDone?: (input: { conversationId: string; done: boolean }) => Promise<Result>;
  toggleTag?: (input: { contactId: string; tagId: string }) => Promise<Result>;
  createTag?: (input: { contactId: string; label: string }) => Promise<Result>;
  /** Giao khách đang hỏi (hội thoại chưa có lead) cho nhân viên; null khi không có quyền giao. */
  assignConv?: (input: { conversationId: string; assigneeId: string | null }) => Promise<Result>;
  /** Chuyển khách đang hỏi thành lead (Sale admin, Owner); không truyền khi không có quyền. */
  qualify?: (input: { conversationId: string }) => Promise<Result>;
  /** Tiếp quản (on = false) hoặc Trả lại AI (on = true); không truyền khi không gửi được tin. */
  aiSwitch?: (input: { conversationId: string; on: boolean }) => Promise<Result>;
}) {
  const router = useRouter();
  const toast = useToast();
  const urlC = useSearchParams().get("c");
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("all");
  const [channel, setChannel] = useState<"" | Channel>("");
  const [staff, setStaff] = useState("");
  const [tag, setTag] = useState("");
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => new Date());
  const msgs = useRef<HTMLDivElement>(null);
  // Hội thoại đang mở theo địa chỉ (?c=). Bấm chọn thì đổi ngay ở lượt vẽ khẩn (`picked`), không chờ Next.js cập nhật
  // địa chỉ; địa chỉ đổi xong (hoặc bấm Quay lại của trình duyệt) thì theo địa chỉ.
  const [picked, setPicked] = useState<{ id: string | null } | null>(null);
  const [seenUrl, setSeenUrl] = useState(urlC);
  if (seenUrl !== urlC) {
    setSeenUrl(urlC);
    setPicked(null);
  }
  const c = convs.find((x) => x.id === (picked ? picked.id : urlC)) ?? null;

  // Bộ nhớ tạm theo hội thoại. Bản trang gửi xuống (selectedId) ghi vào ngay khi tới.
  const [store, setStore] = useState<Store>(() => ({
    ver: 1,
    map: selectedId && thread ? { [selectedId]: { thread, side, ver: 1 } } : {},
  }));
  const [seen, setSeen] = useState({ thread, side });
  if (seen.thread !== thread || seen.side !== side) {
    setSeen({ thread, side });
    if (selectedId && thread)
      setStore((s) => ({
        ver: s.ver + 1,
        map: { ...s.map, [selectedId]: { thread, side, ver: s.ver + 1 } },
      }));
  }
  const [failed, setFailed] = useState<Record<string, string>>({});
  // Hội thoại vừa mở có tin chưa đọc: ẩn số chưa đọc ngay, không chờ lưu xong (tin mới đến làm số đổi thì hiện lại).
  const [cleared, setCleared] = useState<Record<string, number>>({});
  const entry = c ? (store.map[c.id] ?? null) : null;
  const shown = entry?.thread ?? null;
  const side2 = entry?.side ?? null;

  const verRef = useRef(store.ver);
  const fetchedAt = useRef(new Map<string, number>());
  const inflight = useRef(new Set<string>());
  const staleSince = useRef(0);
  useEffect(() => {
    verRef.current = store.ver;
  }, [store.ver]);
  useEffect(() => {
    if (selectedId && thread) fetchedAt.current.set(selectedId, Date.now());
  }, [selectedId, thread]);

  const load = useCallback(async (id: string) => {
    if (inflight.current.has(id)) return;
    inflight.current.add(id);
    const startVer = verRef.current;
    const startAt = Date.now();
    try {
      const res = await fetch(`/api/inbox/thread?c=${encodeURIComponent(id)}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as
        { thread: LiveThread; side: LiveSide | null } | { error: string } | null;
      if (!res.ok || !body || !("thread" in body)) {
        const message =
          body && "error" in body ? body.error : "Chưa tải được tin nhắn, kiểm tra mạng rồi thử lại.";
        setFailed((f) => ({ ...f, [id]: message }));
        return;
      }
      fetchedAt.current.set(id, startAt);
      setFailed((f) => {
        if (!(id in f)) return f;
        const next = { ...f };
        delete next[id];
        return next;
      });
      // Bản trang tới sau khi bắt đầu tải là mới hơn: giữ bản trang.
      setStore((s) =>
        (s.map[id]?.ver ?? 0) > startVer
          ? s
          : {
              ver: s.ver + 1,
              map: { ...s.map, [id]: { thread: body.thread, side: body.side, ver: s.ver + 1 } },
            },
      );
    } catch {
      setFailed((f) => ({ ...f, [id]: "Chưa tải được tin nhắn, kiểm tra mạng rồi thử lại." }));
    } finally {
      inflight.current.delete(id);
    }
  }, []);

  /** Có sẵn thì thôi; `fresh` thì tải lại khi bản đang có đã cũ. Tải sẵn bỏ qua khi đang tải nhiều. */
  const ensure = useCallback(
    (id: string, fresh: boolean) => {
      const has = Boolean(store.map[id]);
      if (!fresh && (has || inflight.current.size >= MAX_INFLIGHT)) return;
      const at = fetchedAt.current.get(id) ?? 0;
      if (has && at > staleSince.current && Date.now() - at < FRESH_MS) return;
      void load(id);
    },
    [store.map, load],
  );

  // Tải sẵn vài hội thoại đầu danh sách để lần bấm đầu tiên cũng hiện ngay.
  const top = convs
    .slice(0, 3)
    .map((x) => x.id)
    .join(",");
  useEffect(() => {
    const t = setTimeout(() => {
      for (const id of top.split(",")) if (id) ensure(id, false);
    }, 600);
    return () => clearTimeout(t);
  }, [top]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tin mới của khách: Realtime báo khi hội thoại, tin nhắn đổi (RLS chỉ gửi dòng mình được xem) rồi tải lại từ
  // server; không hỏi lại định kỳ cho đỡ tốn lượt gọi. Đồng hồ khung giờ chạy mỗi 30 giây.
  useLiveChanges("inbox", [{ table: "messages" }, { table: "conversations" }], () => {
    staleSince.current = Date.now();
    router.refresh();
  });
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    msgs.current?.scrollTo({ top: msgs.current.scrollHeight });
  }, [shown?.messages.length, shown?.id]);

  // Mở hội thoại có tin chưa đọc thì đánh dấu đã đọc.
  const unread = c?.unread ?? 0;
  useEffect(() => {
    if (c && unread > 0) void markRead({ conversationId: c.id }).then(() => router.refresh());
  }, [c?.id, unread, markRead, router]); // eslint-disable-line react-hooks/exhaustive-deps

  const staffList = [
    ...new Map(convs.filter((x) => x.holderId).map((x) => [x.holderId!, x.holder ?? "Nhân viên"])),
  ].sort((a, b) => a[1].localeCompare(b[1], "vi"));
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const list = convs
    .filter((x) => !q.trim() || fold(x.name).includes(fold(q.trim())))
    .filter((x) => inView(x, view))
    .filter((x) => !channel || x.channel === channel)
    .filter((x) => !staff || x.holderId === staff)
    .filter((x) => !tag || x.tagIds.includes(tag));
  const win = c?.channel === "messenger" ? replyWindow(c.lastInboundAt, now) : null;
  const zwin = c?.channel === "zalo" ? zaloWindow(c.lastInboundAt, now) : null;
  const blocker = c ? blockers[c.channel] : null;
  // Cần xác nhận trước khi gửi: Messenger ngoài 24 giờ (trả lời tay), Zalo ngoài 48 giờ (tin tính phí).
  const needConfirm = win?.mode === "human_agent" || zwin?.mode === "paid";
  const closed = win?.mode === "closed" || zwin?.mode === "closed";

  function act(fn: () => Promise<Result>) {
    start(async () => {
      const r = await fn();
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) router.refresh();
    });
  }

  function open(id: string) {
    if (id === c?.id) return;
    setText("");
    setConfirm(false);
    const x = convs.find((v) => v.id === id);
    if (x?.unread) setCleared((r) => ({ ...r, [id]: x.unread }));
    setPicked({ id });
    // Đổi địa chỉ không tải lại trang (Next.js đồng bộ với useSearchParams); nút Quay lại của trình duyệt vẫn đúng.
    window.history.pushState(null, "", `/inbox?c=${id}`);
    ensure(id, true);
  }

  function closeChat() {
    setPicked({ id: null });
    window.history.pushState(null, "", "/inbox");
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
    <section
      className={`tg cv ${c && (side2 || (!entry && c.contactId)) ? "" : "cv-2"} ${c ? "is-chat" : "is-list"}`}
      aria-labelledby="inbox-title"
    >
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
          {VIEWS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>
              {l}
              <span className="cv-fn">{convs.filter((x) => inView(x, k)).length}</span>
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
          {staffList.length > 1 ? (
            <select aria-label="Lọc theo nhân viên" value={staff} onChange={(e) => setStaff(e.target.value)}>
              <option value="">Mọi nhân viên</option>
              {staffList.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          ) : null}
          {tags.length ? (
            <select aria-label="Lọc theo thẻ" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Mọi thẻ</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          ) : null}
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
                // Tải sẵn khi rê chuột, chạm hoặc chuyển tiêu điểm tới, để lúc bấm tin đã có.
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") ensure(x.id, false);
                }}
                onPointerDown={() => ensure(x.id, false)}
                onFocus={() => ensure(x.id, false)}
              >
                <ConvAvatar c={{ name: x.name, channel: CH[x.channel].avatar, avatar: x.avatar }} />
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
                    {x.unread > 0 && cleared[x.id] !== x.unread ? (
                      <span className="tg-badge" aria-label={`${x.unread} tin chưa đọc`}>
                        {x.unread}
                      </span>
                    ) : needsReply(x) ? (
                      <span className="tg-badge cv-need">Cần trả lời</span>
                    ) : null}
                  </span>
                  <span className="cv-meta">
                    {CH[x.channel].label}
                    {x.done ? " · Đã xong" : ""}
                  </span>
                  <span className="cv-chips">
                    {x.ai === "on" ? (
                      <span className="cv-tag cv-ai">
                        <Bot size={11} aria-hidden /> AI
                      </span>
                    ) : null}
                    {x.leadId ? null : <span className="cv-tag cv-inquiry">Đang hỏi</span>}
                    <span className={`cv-staff ${x.holder ? "" : "is-none"}`}>
                      <UserRound size={11} aria-hidden />
                      {x.holder ?? "Chưa giao"}
                    </span>
                    {x.tagIds
                      .map((id) => tagById.get(id))
                      .filter((t): t is LiveTag => Boolean(t))
                      .slice(0, 2)
                      .map((t) => (
                        <span key={t.id} className="cv-tag" style={{ "--t": t.color } as React.CSSProperties}>
                          {t.label}
                        </span>
                      ))}
                    {x.tagIds.length > 2 ? (
                      <span className="cv-tag is-more">+{x.tagIds.length - 2}</span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="tg-main">
        {!c ? (
          <p className="tg-readonly">Chọn một hội thoại ở bên trái để đọc và trả lời.</p>
        ) : (
          <>
            <div className="tg-head">
              <div className="tg-pill tg-head-l">
                <button
                  type="button"
                  className="tg-ib tg-mback"
                  aria-label="Về danh sách hội thoại"
                  onClick={closeChat}
                >
                  <ArrowLeft size={18} />
                </button>
                <ConvAvatar c={{ name: c.name, channel: CH[c.channel].avatar, avatar: c.avatar }} size={38} />
                <span className="min-w-0">
                  <b className="tg-title">{c.name}</b>
                  <span className="tg-sub">
                    {CH[c.channel].label} ·{" "}
                    {c.leadId
                      ? c.holder
                        ? `${c.holder} giữ lead`
                        : "Chưa giao"
                      : `Khách đang hỏi · ${c.holder ? `${c.holder} phụ trách` : "chưa giao"}`}
                    {c.done ? <span className="cv-st is-ok"> · Đã xong</span> : null}
                    {c.ai === "on" ? <span className="cv-st is-ai"> · AI đang trả lời</span> : null}
                    {c.ai === "paused" ? (
                      <span className="cv-st">
                        {" "}
                        · {AI_PAUSE[c.aiPause ?? ""] ?? "AI đã dừng ở hội thoại này"}
                      </span>
                    ) : null}
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
              {assignees && (c.leadId ? assign : assignConv) ? (
                <label className="tg-pill cv-assign">
                  <UserRound size={15} aria-hidden />
                  <select
                    aria-label="Nhân viên phụ trách"
                    value={c.holderId ?? ""}
                    disabled={pending}
                    onChange={(e) => {
                      const to = e.target.value || null;
                      const name = assignees.find((a) => a.id === to)?.name;
                      act(() =>
                        c.leadId
                          ? assign!({
                              leadIds: [c.leadId],
                              assigneeId: to,
                              assigneeName: name,
                              reason: "Giao từ Hội thoại",
                            })
                          : assignConv!({ conversationId: c.id, assigneeId: to }),
                      );
                    }}
                  >
                    <option value="">Chưa giao</option>
                    {[
                      ...assignees,
                      ...(c.holderId && !assignees.some((a) => a.id === c.holderId)
                        ? [{ id: c.holderId, name: c.holder ?? "Nhân viên" }]
                        : []),
                    ].map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {aiSwitch && c.ai === "on" ? (
                <button
                  type="button"
                  className="tg-pill cv-hbtn is-blue"
                  disabled={pending}
                  title="AI dừng ở hội thoại này, anh chị trả lời"
                  onClick={() => act(() => aiSwitch({ conversationId: c.id, on: false }))}
                >
                  <UserRound size={15} aria-hidden /> Tiếp quản
                </button>
              ) : aiSwitch && c.ai === "paused" ? (
                <button
                  type="button"
                  className="tg-pill cv-hbtn"
                  disabled={pending}
                  title="AI trả lời tiếp từ tin sau của khách"
                  onClick={() => act(() => aiSwitch({ conversationId: c.id, on: true }))}
                >
                  <Bot size={15} aria-hidden /> Trả lại AI
                </button>
              ) : null}
              {setDone ? (
                <button
                  type="button"
                  className="tg-pill cv-hbtn"
                  disabled={pending}
                  onClick={() => act(() => setDone({ conversationId: c.id, done: !c.done }))}
                >
                  {c.done ? (
                    <>
                      <RotateCcw size={15} aria-hidden /> Mở lại
                    </>
                  ) : (
                    <>
                      <CheckCheck size={15} aria-hidden /> Đánh dấu xong
                    </>
                  )}
                </button>
              ) : null}
              {c.leadId ? (
                <Link className="tg-pill cv-hbtn" href={`/leads/${c.leadId}`}>
                  <ExternalLink size={15} aria-hidden /> Mở hồ sơ lead
                </Link>
              ) : qualify && c.contactId ? (
                <button
                  type="button"
                  className="tg-pill cv-hbtn is-blue"
                  disabled={pending}
                  onClick={() => act(() => qualify({ conversationId: c.id }))}
                >
                  <UserPlus size={15} aria-hidden /> Chuyển thành lead
                </button>
              ) : null}
            </div>

            {side2?.notes.some((n) => n.pinned) ? (
              <div className="cv-pins" aria-label="Ghi chú ghim">
                {side2.notes
                  .filter((n) => n.pinned)
                  .map((n) => (
                    <p key={n.id} className="cv-pin">
                      <Pin size={13} aria-hidden /> {n.text}
                    </p>
                  ))}
              </div>
            ) : null}
            {c.ai === "paused" && c.aiPause === "handoff" && shown?.handoff ? (
              <div className="cv-pins cv-ai-note" aria-label="AI chuyển cho nhân viên">
                <p className="cv-pin">
                  <Bot size={13} aria-hidden />
                  <span>
                    <b>AI chuyển cho nhân viên: {shown.handoff.reason}.</b>
                    {shown.handoff.summary ? ` ${shown.handoff.summary}` : ""}
                  </span>
                </p>
              </div>
            ) : null}
            <div className="tg-msgs" ref={msgs} role="log" aria-label="Tin nhắn" aria-busy={!shown}>
              {!shown ? (
                failed[c.id] ? (
                  <p className="tg-readonly" role="alert">
                    {failed[c.id]}{" "}
                    <button type="button" className="c-link" onClick={() => void load(c.id)}>
                      Thử lại
                    </button>
                  </p>
                ) : (
                  <div className="cv-skel-msgs" role="status" aria-label="Đang tải tin nhắn">
                    {["is-in", "is-in", "is-out", "is-in", "is-out"].map((k, i) => (
                      <span key={i} className={`c-skel ${k}`} />
                    ))}
                  </div>
                )
              ) : null}
              {shown?.messages.map((m, i) => {
                const next = shown.messages[i + 1];
                const tail = !next || next.out !== m.out;
                return (
                  <div
                    key={m.id}
                    className={`tg-row ${m.out ? "is-out" : "is-in"} ${tail ? "has-tail" : ""}`}
                  >
                    {!m.out ? (
                      <span className="tg-row-av">
                        {tail ? (
                          <ConvAvatar
                            c={{ name: c.name, channel: CH[c.channel].avatar, avatar: c.avatar }}
                            size={34}
                          />
                        ) : null}
                      </span>
                    ) : null}
                    <div className={`tg-bubble cv-msg ${m.ai ? "is-agent" : ""}`}>
                      {m.ai ? (
                        <b className="tg-from cv-agent">
                          <Bot size={14} aria-hidden /> Agent AI
                        </b>
                      ) : m.out && m.by ? (
                        <b className="tg-from">{m.by}</b>
                      ) : null}
                      {m.text ? <p className="tg-text">{m.text}</p> : null}
                      {m.media.length ? (
                        <MessageMedia items={m.media} channel={CH[c.channel].label} out={m.out} />
                      ) : null}
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
                    placeholder={
                      c.ai === "on"
                        ? "AI đang trả lời khách. Anh chị gửi tin thì AI dừng ở hội thoại này…"
                        : `Trả lời ${c.name} qua ${CH[c.channel].label}…`
                    }
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
      {c && side2 ? (
        <InboxLiveSide
          side={side2}
          channel={CH[c.channel].label}
          tagging={
            toggleTag && createTag ? { all: tags, on: c.tagIds, toggle: toggleTag, create: createTag } : null
          }
        />
      ) : c && !entry && c.contactId ? (
        <aside className="tg-info cv-info" aria-label="Thông tin khách" aria-busy>
          <div className="cv-skel-side" role="status" aria-label="Đang tải thông tin khách">
            <span className="c-skel is-title" />
            <span className="c-skel is-line" />
            <span className="c-skel is-line" />
            <span className="c-skel is-tile" />
            <span className="c-skel is-line" />
          </div>
        </aside>
      ) : null}
    </section>
  );
}

type View = "all" | "need" | "mine" | "inquiry" | "unassigned" | "done";

const VIEWS: [View, string][] = [
  ["all", "Tất cả"],
  ["need", "Cần trả lời"],
  ["mine", "Của tôi"],
  ["inquiry", "Đang hỏi"],
  ["unassigned", "Chưa giao"],
  ["done", "Đã xong"],
];

/** Khách nhắn cuối và hội thoại chưa xong: đang chờ nhân viên trả lời. */
function needsReply(x: LiveConv) {
  return !x.done && Boolean(x.preview) && !x.preview!.out;
}

function inView(x: LiveConv, v: View) {
  switch (v) {
    case "need":
      return needsReply(x);
    case "mine":
      return x.mine;
    case "inquiry":
      return !x.leadId;
    case "unassigned":
      return !x.holderId;
    case "done":
      return x.done;
    default:
      return true;
  }
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
export function MessageMedia({
  items,
  channel,
  out,
}: {
  items: Attachment[];
  channel: string;
  out: boolean;
}) {
  return (
    <div className="cv-media">
      {items.map((a, i) =>
        a.url && (a.kind === "image" || a.kind === "sticker") ? (
          <MediaImage key={i} url={a.url} label={MEDIA_LABEL[a.kind]} channel={channel} out={out} />
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

function MediaImage({
  url,
  label,
  channel,
  out,
}: {
  url: string;
  label: string;
  channel: string;
  /** Ảnh nhân viên gửi (kể cả gửi trên hộp thư Page) hay ảnh khách gửi. */
  out: boolean;
}) {
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
        alt={out ? `${label} gửi khách` : `${label} khách gửi`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    </a>
  );
}
