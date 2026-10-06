"use client";

import { Paperclip, Reply, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Switch } from "@/components/ui/switch";
import {
  defaultPrefs,
  eventsFor,
  inQuietHours,
  type NotifyButton,
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
const BOT = "DaiVietQ4Bot";

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

export function NotifySettings() {
  const { state, act } = useCrm();
  const { me, perms } = useShell();
  const p: NotifyPrefs = state.notifyPrefs[me] ?? defaultPrefs();
  const save = (patch: Partial<NotifyPrefs>, msg?: string) =>
    act({ type: "notifyPrefs", who: me, patch, actor: me }, msg);
  const events = eventsFor(perms);

  return (
    <div className="tgset">
      <div className="c-stack">
        <Card title="Liên kết Telegram" note={p.linked ? `Đã liên kết ${p.telegram}` : "Chưa liên kết"}>
          {p.linked ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="c-pill is-ok">Đang nhận thông báo qua @{BOT}</span>
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
                Bấm nút dưới để mở bot <b>@{BOT}</b> trên Telegram (điện thoại hoặc máy tính).
              </li>
              <li>
                Trong Telegram bấm <b>Start</b>. Link chỉ dùng được một lần, hết hạn sau 10 phút.
              </li>
              <li className="list-none">
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <a
                    className="c-btn is-blue"
                    href={`https://t.me/${BOT}?start=link_demo`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở Telegram để liên kết
                  </a>
                  <button
                    type="button"
                    className="c-btn"
                    onClick={() =>
                      save({ linked: true, telegram: `@${me.toLowerCase()}_daiviet` }, "Đã liên kết Telegram")
                    }
                  >
                    Mô phỏng: đã bấm Start
                  </button>
                </div>
              </li>
            </ol>
          )}
        </Card>

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
            {events.map((e) => (
              <li key={e.key} className="flex items-center gap-3">
                <span className="flex-1">
                  {e.label}
                  <span className="c-lbl block">{e.hint}</span>
                </span>
                <Switch
                  label={e.label}
                  checked={p.events[e.key] ?? e.defaultOn}
                  onCheckedChange={(v) => save({ events: { ...p.events, [e.key]: v } })}
                />
              </li>
            ))}
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
      </div>

      <TelegramPhone prefs={p} />
    </div>
  );
}

/** Điện thoại xem trước: khung chat với bot, tin mới nhất ở dưới, nút nhanh dưới từng tin như Telegram.
 *  Trả lời (reply) vào tin báo về lead, đơn thì nội dung về hồ sơ trong CRM (components/crm/telegram-in.ts). */
function TelegramPhone({ prefs }: { prefs: NotifyPrefs }) {
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
            <span className="tg-sub">bot · @{BOT}</span>
          </span>
        </div>
        <div className="tgp-msgs" ref={box} role="log" aria-label="Tin bot gửi">
          {!prefs.linked ? (
            <p className="tg-day">
              <span>Chưa liên kết: tin dưới đây là xem trước, chưa gửi tới điện thoại.</span>
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
