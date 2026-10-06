"use client";

import { Copy, Paperclip, Reply, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";

import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  defaultPrefs,
  eventsFor,
  inQuietHours,
  type NotifyButton,
  type NotifyEvent,
  type NotifyPrefs,
} from "@/lib/notify/events";
import { useShell } from "../shell-context";
import { tgTarget } from "../telegram-in";
import { fmtMinutes, notesFor, useCrm, type TgChatMsg } from "../store";

// Thông báo Telegram của từng người (CLAUDE.md 10.3, telegram_bot): liên kết tài khoản, mức chi tiết tự chọn,
// sự kiện muốn nhận, giờ im lặng; bên phải là điện thoại xem trước đúng tin bot sẽ gửi, nút nhanh bấm được.

const HOURS = Array.from(
  { length: 48 },
  (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
);
/** Tên bot khi chạy bản demo; bản thật lấy từ Cài đặt → Tích hợp. */
const DEMO_BOT = "DaiVietQ4Bot";

type Result = { ok: boolean; message: string };

/** Nhóm Telegram Owner đã gán công dụng (chỉ người có settings.integrations thấy). */
export interface LiveTelegramGroup {
  title: string;
  purpose: string;
  status: string;
}

/**
 * Bản thật: liên kết, thiết lập, nhóm đọc từ database qua server action (RLS và nhật ký ở database).
 * Không có thì màn chạy mô phỏng trong trình duyệt như bản demo.
 */
export interface LiveNotify {
  botUsername: string | null;
  prefs: NotifyPrefs;
  groups: LiveTelegramGroup[];
  canSeeGroups: boolean;
  createLink: () => Promise<{ ok: true; url: string; minutes: number } | { ok: false; message: string }>;
  unlink: () => Promise<Result>;
  savePrefs: (input: {
    level?: NotifyPrefs["level"];
    events?: Partial<Record<NotifyEvent, boolean>>;
    quiet?: { on: boolean; from: string; to: string };
  }) => Promise<Result>;
}

const LiveContext = createContext<LiveNotify | null>(null);

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="c-card" aria-label={title}>
      <div className="c-ch">
        <h2>{title}</h2>
        {note ? <span className="c-r c-lbl">{note}</span> : null}
      </div>
      <div className="c-cb">{children}</div>
    </section>
  );
}

/** Bản demo: bấm "Mô phỏng: đã bấm Start" để xem màn sau khi liên kết, không gọi Telegram thật. */
function DemoLinkCard({
  prefs,
  save,
}: {
  prefs: NotifyPrefs;
  save: (patch: Partial<NotifyPrefs>, msg?: string) => void;
}) {
  const { me } = useShell();
  const { act } = useCrm();
  return (
    <Card title="Liên kết Telegram" note={prefs.linked ? `Đã liên kết ${prefs.telegram}` : "Chưa liên kết"}>
      {prefs.linked ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="c-pill is-ok">Đang nhận thông báo qua @{DEMO_BOT}</span>
          <button
            type="button"
            className="c-btn"
            onClick={() => act({ type: "notifyTest", who: me }, "Đã gửi tin thử")}
          >
            Gửi tin thử
          </button>
          <button
            type="button"
            className="c-btn is-ghost is-danger"
            onClick={() => save({ linked: false, telegram: undefined }, "Đã gỡ liên kết Telegram")}
          >
            Gỡ liên kết
          </button>
        </div>
      ) : (
        <ol className="m-0 space-y-2 pl-5">
          <li>
            Bấm nút dưới để mở bot <b>@{DEMO_BOT}</b> trên Telegram (điện thoại hoặc máy tính).
          </li>
          <li>
            Trong Telegram bấm <b>Start</b>. Link chỉ dùng được một lần, hết hạn sau 10 phút.
          </li>
          <li className="list-none">
            <button
              type="button"
              className="c-btn mt-1"
              onClick={() =>
                save({ linked: true, telegram: `@${me.toLowerCase()}_daiviet` }, "Đã liên kết Telegram")
              }
            >
              Mô phỏng: đã bấm Start
            </button>
          </li>
        </ol>
      )}
    </Card>
  );
}

/** Bản thật: link liên kết do database sinh (một lần, 10 phút), chỉ hiện cho chính chủ, không ghi ra nhật ký. */
function LiveLinkCard({ live, pending }: { live: LiveNotify; pending: boolean }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [link, setLink] = useState<{ url: string; minutes: number }>();
  const p = live.prefs;
  const busyAll = busy || pending;

  const make = () =>
    start(async () => {
      try {
        const r = await live.createLink();
        if (!r.ok) {
          toast(r.message, "err");
          return;
        }
        setLink({ url: r.url, minutes: r.minutes });
      } catch {
        toast("Chưa tạo được link liên kết, thử lại sau ít phút.", "err");
      }
    });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast("Đã chép link", "ok");
    } catch {
      toast("Trình duyệt không cho chép, anh chị bấm giữ để chép tay.", "err");
    }
  };

  return (
    <Card
      title="Liên kết Telegram"
      note={p.linked ? `Đã liên kết ${p.telegram ?? ""}`.trim() : "Chưa liên kết"}
    >
      {p.linked ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="c-pill is-ok">
            Đang nhận thông báo{live.botUsername ? ` qua @${live.botUsername}` : ""}
          </span>
          <button
            type="button"
            className="c-btn is-ghost is-danger"
            disabled={busyAll}
            onClick={() =>
              start(async () => {
                try {
                  const r = await live.unlink();
                  toast(r.message, r.ok ? "ok" : "err");
                } catch {
                  toast("Chưa gỡ được liên kết, thử lại sau ít phút.", "err");
                }
              })
            }
          >
            Gỡ liên kết
          </button>
        </div>
      ) : !live.botUsername ? (
        <p className="c-lbl m-0">
          Chưa khai tên bot. Owner điền ở <b>Cài đặt → Tích hợp → Thông báo Telegram cho nhân viên</b>, sau đó
          anh chị quay lại trang này để liên kết.
        </p>
      ) : (
        <ol className="m-0 space-y-2 pl-5">
          <li>
            Bấm <b>Tạo link liên kết</b>. Link chỉ dùng được một lần, hết hạn sau 10 phút.
          </li>
          <li>
            Mở link bằng Telegram (điện thoại hoặc máy tính) rồi bấm <b>Start</b>.
          </li>
          <li className="list-none">
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <button type="button" className="c-btn is-blue" disabled={busyAll} onClick={make}>
                {link ? "Tạo link khác" : "Tạo link liên kết"}
              </button>
              {link ? (
                <>
                  <a className="c-btn" href={link.url} target="_blank" rel="noreferrer">
                    Mở Telegram
                  </a>
                  <button type="button" className="c-btn is-ghost" onClick={copy}>
                    <Copy size={14} className="mr-1 inline" aria-hidden />
                    Chép link
                  </button>
                </>
              ) : null}
            </div>
            {link ? (
              <p className="c-lbl mt-1.5 mb-0 break-all">
                {link.url}
                <span className="block">
                  Hết hạn sau {link.minutes} phút, dùng một lần. Tạo link khác thì link cũ hết hiệu lực.
                </span>
              </p>
            ) : null}
          </li>
        </ol>
      )}
    </Card>
  );
}

export function NotifySettings({ live }: { live?: LiveNotify }) {
  return (
    <LiveContext.Provider value={live ?? null}>
      <NotifyBody />
    </LiveContext.Provider>
  );
}

function NotifyBody() {
  const live = useContext(LiveContext);
  const { state, act } = useCrm();
  const { me, perms } = useShell();
  const toast = useToast();
  const [pending, start] = useTransition();
  const p: NotifyPrefs = live ? live.prefs : (state.notifyPrefs[me] ?? defaultPrefs());
  // Bản thật: lưu xuống database rồi trang tải lại; bản demo: đổi ngay trong bộ nhớ trình duyệt.
  const save = (patch: Partial<NotifyPrefs>, msg?: string) => {
    if (!live) {
      act({ type: "notifyPrefs", who: me, patch, actor: me }, msg);
      return;
    }
    start(async () => {
      try {
        const r = await live.savePrefs({ level: patch.level, events: patch.events, quiet: patch.quiet });
        toast(msg && r.ok ? msg : r.message, r.ok ? "ok" : "err");
      } catch {
        toast("Chưa lưu được thiết lập, thử lại sau ít phút.", "err");
      }
    });
  };
  const events = eventsFor(perms);

  return (
    <div className="tgset">
      <div className="c-stack">
        {live ? <LiveLinkCard live={live} pending={pending} /> : <DemoLinkCard prefs={p} save={save} />}

        <Card title="Mức chi tiết của tin" note="Không bao giờ có số điện thoại, nội dung tin của khách">
          <div className="space-y-2" role="radiogroup" aria-label="Mức chi tiết">
            {(
              [
                ["short", "Rút gọn", "Chỉ báo có việc: “Anh chị có 1 lead mới, gọi trước 09:17.”"],
                [
                  "detail",
                  "Chi tiết",
                  "Thêm tên gọi ngắn, sản phẩm: “Lead mới: Thu (Hàn), Ghế DV-X9. Gọi trước 09:17.”",
                ],
              ] as const
            ).map(([k, label, ex]) => (
              <label key={k} className="flex items-start gap-2">
                <input
                  type="radio"
                  className="mt-1"
                  checked={p.level === k}
                  onChange={() => save({ level: k }, `Đã chọn: ${label}`)}
                />
                <span>
                  <b>{label}</b>
                  <span className="c-lbl block">{ex}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card title="Báo cho tôi khi">
          <ul className="m-0 list-none space-y-2 p-0">
            {events.map((e) => {
              // Bản thật chưa sinh được loại tin này: khóa công tắc và nói lý do, đừng để bật rồi chờ vô ích.
              const pendingWhy = live ? e.notYetLive : undefined;
              return (
                <li key={e.key} className="flex items-center gap-3">
                  <span className="flex-1">
                    {e.label}
                    <span className="c-lbl block">{pendingWhy ? `Sắp có: ${pendingWhy}` : e.hint}</span>
                  </span>
                  <Switch
                    label={e.label}
                    disabled={Boolean(pendingWhy)}
                    checked={pendingWhy ? false : (p.events[e.key] ?? e.defaultOn)}
                    onCheckedChange={(v) => save({ events: { ...p.events, [e.key]: v } })}
                  />
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Giờ im lặng" note="Tin vẫn tới nhưng không rung, không chuông">
          <div className="flex flex-wrap items-center gap-2">
            <Switch
              label="Bật giờ im lặng"
              checked={p.quiet.on}
              onCheckedChange={(v) => save({ quiet: { ...p.quiet, on: v } })}
            />
            <span>Từ</span>
            <select
              aria-label="Im lặng từ"
              value={p.quiet.from}
              disabled={!p.quiet.on}
              onChange={(e) => save({ quiet: { ...p.quiet, from: e.target.value } })}
              className="rounded-control border border-line bg-surface px-2 py-1.5"
            >
              {HOURS.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
            <span>đến</span>
            <select
              aria-label="Im lặng đến"
              value={p.quiet.to}
              disabled={!p.quiet.on}
              onChange={(e) => save({ quiet: { ...p.quiet, to: e.target.value } })}
              className="rounded-control border border-line bg-surface px-2 py-1.5"
            >
              {HOURS.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
        </Card>

        {live?.canSeeGroups ? <GroupsCard groups={live.groups} /> : null}
      </div>

      <TelegramPhone prefs={p} />
    </div>
  );
}

const PURPOSE_LABEL: Record<string, string> = {
  general: "Nhóm chung",
  delivery: "Nhóm giao hàng",
  care: "Nhóm chăm sóc khách hàng",
  announce: "Kênh thông báo chung",
  unused: "Chưa gán",
};
const GROUP_STATUS: Record<string, string> = {
  pending: "Chờ gán",
  active: "Đang dùng",
  inactive: "Tạm ngưng",
  lost: "Bot đã rời nhóm",
};

/** Nhóm Telegram bot đang ở. Owner gán công dụng bằng lệnh /gan ngay trong nhóm. */
function GroupsCard({ groups }: { groups: LiveTelegramGroup[] }) {
  return (
    <Card title="Nhóm Telegram của đội" note="Gán bằng lệnh /gan ngay trong nhóm">
      {groups.length === 0 ? (
        <p className="c-lbl m-0">
          Chưa có nhóm nào. Thêm bot vào nhóm của đội, rồi gõ trong nhóm: <b>/gan chung</b>,{" "}
          <b>/gan giaohang</b>, <b>/gan cskh</b> hoặc <b>/gan thongbao</b>.
        </p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {groups.map((g, i) => (
            <li key={`${g.title}-${i}`} className="flex items-center gap-2">
              <span className="flex-1">
                {g.title || "(nhóm chưa đặt tên)"}
                <span className="c-lbl block">{PURPOSE_LABEL[g.purpose] ?? g.purpose}</span>
              </span>
              <span className={`c-pill ${g.status === "active" ? "is-ok" : ""}`}>
                {GROUP_STATUS[g.status] ?? g.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Điện thoại xem trước: khung chat với bot, tin mới nhất ở dưới, nút nhanh dưới từng tin như Telegram.
 *  Trả lời (reply) vào tin báo về lead, đơn thì nội dung về hồ sơ trong CRM (components/crm/telegram-in.ts). */
function TelegramPhone({ prefs }: { prefs: NotifyPrefs }) {
  const live = useContext(LiveContext);
  const bot = live?.botUsername ?? DEMO_BOT;
  const { state, act, dispatch } = useCrm();
  const { me, userId } = useShell();
  const router = useRouter();
  const notes = notesFor(state, me).slice(0, 30);
  const chat = state.tgChat.filter((m) => m.to === me).slice(0, 40);
  const num = (id: string) => Number(id.replace(/\D/g, "")) || 0;
  type Item = { kind: "note"; n: (typeof notes)[number] } | { kind: "chat"; m: TgChatMsg };
  const items: Item[] = [
    ...notes.map((n) => ({ kind: "note" as const, n })),
    ...chat.map((m) => ({ kind: "chat" as const, m })),
  ].sort((x, y) => num(x.kind === "note" ? x.n.id : x.m.id) - num(y.kind === "note" ? y.n.id : y.m.id));

  const [replyTo, setReplyTo] = useState<string>();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string>();
  const [amount, setAmount] = useState("");
  const replyNote = replyTo ? notes.find((n) => n.id === replyTo) : undefined;
  const replyOrder = replyNote ? Boolean(tgTarget(replyNote.path).orderId) : false;

  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [items.length]);

  function press(b: NotifyButton) {
    if (b.kind === "open") router.push(b.path);
    else if (b.kind === "task_done")
      act({ type: "completeTask", id: b.taskId, outcome: "Xong từ Telegram", actor: me }, "Đã đánh dấu xong");
    else act({ type: "snoozeTask", id: b.taskId, minutes: b.minutes, actor: me }, "Đã hẹn lại 1 giờ");
  }

  function send(raw = text) {
    if (!raw.trim() && !photo) return;
    const ok = dispatch({
      type: "tgReply",
      who: me,
      actor: me,
      actorId: userId,
      replyTo,
      text: raw,
      photo,
      amount: amount ? Number(amount.replace(/\D/g, "")) : undefined,
    });
    if (ok === false) return;
    setText("");
    setPhoto(undefined);
    setAmount("");
    setReplyTo(undefined);
  }

  return (
    <aside className="tgp" aria-label="Xem trước trên Telegram">
      <div className="tgp-phone">
        <div className="tgp-head">
          <span
            className="tg-av"
            style={{ width: 36, height: 36, background: "#3390ec", fontSize: 14 }}
            aria-hidden
          >
            ĐV
          </span>
          <span>
            <b>Đại Việt CRM</b>
            <span className="tg-sub">bot · @{bot}</span>
          </span>
        </div>
        <div className="tgp-msgs" ref={box} role="log" aria-label="Tin bot gửi">
          {!prefs.linked ? (
            <p className="tg-day">
              <span>Chưa liên kết: tin dưới đây là xem trước, chưa gửi tới điện thoại.</span>
            </p>
          ) : live ? (
            <p className="tg-day">
              <span>Khung này là xem trước cách bot viết tin; tin thật nằm trong Telegram của anh chị.</span>
            </p>
          ) : null}
          {items.length === 0 ? (
            <p className="tg-day">
              <span>
                Chưa có tin. Khi có lead mới, việc cần duyệt… tin sẽ hiện ở đây. Bấm Gửi tin thử để xem.
              </span>
            </p>
          ) : null}
          {items.map((it) =>
            it.kind === "note" ? (
              <div key={it.n.id} className="tgp-note">
                <div className="tg-bubble">
                  <p className="tg-text">{it.n.text}</p>
                  <span className="tg-meta">
                    {inQuietHours(prefs.quiet, it.n.at) ? <span className="tg-time">im lặng ·</span> : null}
                    <span className="tg-time">{it.n.at}</span>
                  </span>
                </div>
                <div className="tgp-kb">
                  {it.n.buttons.map((b) => (
                    <button key={b.label} type="button" onClick={() => press(b)}>
                      {b.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label={`Trả lời tin: ${it.n.text}`}
                    onClick={() => setReplyTo(it.n.id)}
                  >
                    <Reply size={13} className="mr-1 inline" aria-hidden />
                    Trả lời
                  </button>
                </div>
              </div>
            ) : (
              <div key={it.m.id} className={`tgp-chat ${it.m.from === "user" ? "is-me" : ""}`}>
                <div className="tg-bubble">
                  {it.m.replyTo ? (
                    <span className="tgp-quote">
                      {notes.find((n) => n.id === it.m.replyTo)?.text ?? "Tin báo"}
                    </span>
                  ) : null}
                  {it.m.photo ? <span className="tgp-photo">Ảnh: {it.m.photo}</span> : null}
                  <p className="tg-text">{it.m.text}</p>
                  <span className="tg-meta">
                    <span className="tg-time">{it.m.at}</span>
                  </span>
                </div>
              </div>
            ),
          )}
        </div>
        {replyNote ? (
          <div className="tgp-replying">
            <Reply size={14} aria-hidden />
            <span className="min-w-0 flex-1 truncate">Trả lời: {replyNote.text}</span>
            <button type="button" aria-label="Bỏ trả lời" onClick={() => setReplyTo(undefined)}>
              <X size={14} aria-hidden />
            </button>
          </div>
        ) : null}
        {photo ? (
          <div className="tgp-replying">
            <span className="min-w-0 flex-1 truncate">Ảnh: {photo}</span>
            {replyOrder ? (
              <input
                aria-label="Số tiền trên ảnh"
                inputMode="numeric"
                placeholder="Số tiền"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-28 rounded border border-line px-1.5 py-0.5"
              />
            ) : null}
            <button type="button" aria-label="Bỏ ảnh" onClick={() => setPhoto(undefined)}>
              <X size={14} aria-hidden />
            </button>
          </div>
        ) : null}
        <form
          className="tgp-compose"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label className="tgp-attach" aria-label="Đính kèm ảnh">
            <Paperclip size={17} aria-hidden />
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPhoto(f.name);
                e.target.value = "";
              }}
            />
          </label>
          <input
            aria-label="Nhắn cho bot"
            placeholder={replyNote ? "Ghi chú lưu vào hồ sơ…" : "Tin nhắn hoặc /viec"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" aria-label="Gửi" className="tgp-send">
            <Send size={16} aria-hidden />
          </button>
        </form>
        <div className="tgp-menu">
          <button type="button" className="tgp-open" onClick={() => router.push("/m")}>
            <Send size={15} aria-hidden /> Mở CRM
          </button>
          <button type="button" className="tgp-cmd" onClick={() => send("/viec")}>
            /viec
          </button>
          <span className="tg-sub">Giờ mô phỏng {fmtMinutes(state.minutes)}</span>
        </div>
      </div>
    </aside>
  );
}
