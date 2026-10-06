"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { Switch } from "@/components/ui/switch";
import {
  defaultPrefs,
  eventsFor,
  inQuietHours,
  type NotifyButton,
  type NotifyPrefs,
} from "@/lib/notify/events";
import { useShell } from "../shell-context";
import { fmtMinutes, notesFor, useCrm } from "../store";

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

/** Điện thoại xem trước: khung chat với bot, tin mới nhất ở dưới, nút nhanh dưới từng tin như Telegram. */
function TelegramPhone({ prefs }: { prefs: NotifyPrefs }) {
  const { state, act } = useCrm();
  const { me } = useShell();
  const router = useRouter();
  const notes = notesFor(state, me).slice(0, 30).reverse();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [notes.length]);

  function press(b: NotifyButton) {
    if (b.kind === "open") router.push(b.path);
    else if (b.kind === "task_done")
      act({ type: "completeTask", id: b.taskId, outcome: "Xong từ Telegram", actor: me }, "Đã đánh dấu xong");
    else act({ type: "snoozeTask", id: b.taskId, minutes: b.minutes, actor: me }, "Đã hẹn lại 1 giờ");
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
          {notes.length === 0 ? (
            <p className="tg-day">
              <span>
                Chưa có tin. Khi có lead mới, việc cần duyệt… tin sẽ hiện ở đây. Bấm Gửi tin thử để xem.
              </span>
            </p>
          ) : null}
          {notes.map((n) => (
            <div key={n.id} className="tgp-note">
              <div className="tg-bubble">
                <p className="tg-text">{n.text}</p>
                <span className="tg-meta">
                  {inQuietHours(prefs.quiet, n.at) ? <span className="tg-time">im lặng ·</span> : null}
                  <span className="tg-time">{n.at}</span>
                </span>
              </div>
              <div className="tgp-kb">
                {n.buttons.map((b) => (
                  <button key={b.label} type="button" onClick={() => press(b)}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="tgp-menu">
          <button type="button" className="tgp-open" onClick={() => router.push("/m")}>
            <Send size={15} aria-hidden /> Mở CRM
          </button>
          <span className="tg-sub">Giờ mô phỏng {fmtMinutes(state.minutes)}</span>
        </div>
      </div>
    </aside>
  );
}
