"use client";

import { ArrowLeft, Info, Search } from "lucide-react";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";

// Nhóm nội bộ của đội nằm trên Telegram; CRM chỉ nắm phần kiểm soát: nhóm nào đã nối với CRM, dùng vào việc gì,
// còn hoạt động không, và những tin chính CRM đã đăng vào nhóm.
//
// CRM KHÔNG đọc trò chuyện của đội: bot giữ chế độ riêng tư của Telegram và không làm quản trị nhóm, nên chỉ nhận
// lệnh gửi bot và tin trả lời tin của bot (CLAUDE.md mục 10.3, docs/integrations/telegram_bot.md).

export const GROUP_PURPOSES = [
  { key: "general", label: "Nhóm chung", hint: "Trao đổi chung cả đội" },
  { key: "delivery", label: "Nhóm giao hàng", hint: "Kho, giao lắp" },
  { key: "care", label: "Nhóm chăm sóc khách hàng", hint: "Hậu bán, bảo hành" },
  { key: "announce", label: "Kênh thông báo chung", hint: "CRM đăng tin lead mới, nhắc việc" },
  { key: "unused", label: "Chưa dùng", hint: "CRM không đăng tin vào nhóm này" },
] as const;

export type GroupPurpose = (typeof GROUP_PURPOSES)[number]["key"];

const PURPOSE_LABEL = Object.fromEntries(GROUP_PURPOSES.map((p) => [p.key, p.label])) as Record<
  string,
  string
>;

const STATUS: Record<string, { label: string; cls: string; hint: string }> = {
  active: { label: "Đang dùng", cls: "is-ok", hint: "CRM đăng tin vào nhóm này." },
  pending: {
    label: "Chờ gán",
    cls: "",
    hint: "Bot đã ở trong nhóm nhưng chưa được giao việc gì. Chọn công dụng bên dưới.",
  },
  inactive: { label: "Ngưng", cls: "", hint: "CRM không đăng tin vào nhóm này." },
  lost: {
    label: "Bot đã rời nhóm",
    cls: "is-bad",
    hint: "Thêm bot vào nhóm lại trên Telegram thì nhóm hiện lại ở đây.",
  },
};

export interface LiveGroup {
  /** chat_id của Telegram, dạng chuỗi vì vượt quá số nguyên an toàn của JavaScript. */
  chatId: string;
  title: string;
  purpose: string;
  status: string;
  assignedBy: string | null;
  assignedAt: string | null;
  /** Tin CRM đã đăng vào nhóm, mới nhất trước. */
  posts: { at: string; eventType: string }[];
}

export interface LiveGroups {
  groups: LiveGroup[];
  canManage: boolean;
  botUsername: string | null;
  setGroup: (input: {
    chatId: string;
    purpose: GroupPurpose;
    active: boolean;
  }) => Promise<{ ok: boolean; message: string }>;
}

const POST_LABEL: Record<string, string> = {
  lead_created: "Báo có lead mới",
  group_post: "Tin từ CRM",
};

/** Mỗi nhóm một màu cố định như Telegram, suy từ mã nhóm nên tải lại vẫn giữ nguyên màu. */
const AVATAR_COLORS = ["#e17076", "#7bc862", "#6ec9cb", "#faa774", "#a695e7", "#ee7aae", "#6fb9f0"];
const avatarColor = (chatId: string) => {
  let n = 0;
  for (const ch of chatId) n = (n * 31 + ch.charCodeAt(0)) % 9973;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
};

const initials = (name: string) =>
  (name.trim() || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

export function TelegramGroups({ live }: { live: LiveGroups }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(live.groups[0]?.chatId ?? "");
  const [mobileList, setMobileList] = useState(true);
  const group = live.groups.find((g) => g.chatId === selected) ?? live.groups[0];

  const shown = live.groups.filter(
    (g) =>
      !q.trim() ||
      g.title.toLowerCase().includes(q.toLowerCase()) ||
      (PURPOSE_LABEL[g.purpose] ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <section className={`tg ${mobileList ? "is-list" : "is-chat"}`} aria-label="Nhóm nội bộ">
      <h1 className="sr-only">Nhóm nội bộ</h1>

      <aside className="tg-side" aria-label="Danh sách nhóm">
        <div className="tg-side-h">
          <b>Nhóm nội bộ</b>
        </div>
        <label className="tg-search">
          <Search size={16} aria-hidden />
          <input
            aria-label="Tìm nhóm"
            placeholder="Tìm nhóm, công dụng"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {live.groups.length === 0 ? (
          <p className="c-empty m-3">
            Chưa nhóm nào nối với CRM. Thêm bot
            {live.botUsername ? ` @${live.botUsername}` : ""} vào nhóm của đội trên Telegram, nhóm sẽ hiện ở
            đây.
          </p>
        ) : (
          <ul className="tg-list">
            {shown.map((g) => {
              const active = g.chatId === group?.chatId;
              const st = STATUS[g.status] ?? { label: g.status, cls: "", hint: "" };
              return (
                <li key={g.chatId}>
                  <button
                    type="button"
                    className={`tg-item ${active ? "is-on" : ""}`}
                    aria-current={active}
                    onClick={() => {
                      setSelected(g.chatId);
                      setMobileList(false);
                    }}
                  >
                    <span
                      className="tg-av"
                      style={{ width: 48, height: 48, fontSize: 19, background: avatarColor(g.chatId) }}
                      aria-hidden
                    >
                      {initials(g.title)}
                    </span>
                    <span className="tg-item-b">
                      <span className="tg-item-r1">
                        <b>{g.title || "(nhóm chưa đặt tên)"}</b>
                      </span>
                      <span className="tg-item-r2">
                        <span className="tg-prev">{PURPOSE_LABEL[g.purpose] ?? g.purpose}</span>
                        <span className={`c-pill ${st.cls}`}>{st.label}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <div className="tg-main">
        {group ? <GroupDetail live={live} group={group} onBack={() => setMobileList(true)} /> : null}
      </div>
    </section>
  );
}

function GroupDetail({ live, group, onBack }: { live: LiveGroups; group: LiveGroup; onBack: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const st = STATUS[group.status] ?? { label: group.status, cls: "", hint: "" };
  const lost = group.status === "lost";

  const save = (purpose: GroupPurpose, active: boolean) =>
    start(async () => {
      try {
        const r = await live.setGroup({ chatId: group.chatId, purpose, active });
        toast(r.message, r.ok ? "ok" : "err");
      } catch {
        toast("Chưa lưu được, thử lại sau ít phút.", "err");
      }
    });

  return (
    <>
      <header className="tg-head">
        <div className="tg-pill tg-head-l">
          <button type="button" className="tg-ib tg-mback" aria-label="Về danh sách nhóm" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
          <span
            className="tg-av"
            style={{ width: 38, height: 38, fontSize: 15, background: avatarColor(group.chatId) }}
            aria-hidden
          >
            {initials(group.title)}
          </span>
          <span className="min-w-0">
            <b className="tg-title">{group.title || "(nhóm chưa đặt tên)"}</b>
            <span className="tg-sub">
              {PURPOSE_LABEL[group.purpose] ?? group.purpose} · {st.label}
            </span>
          </span>
        </div>
      </header>

      <div className="c-stack overflow-y-auto p-3">
        <section className="c-card" aria-label="Trò chuyện của nhóm">
          <div className="c-cb flex gap-2">
            <Info size={18} className="mt-0.5 shrink-0" aria-hidden />
            <p className="m-0">
              Nội dung trò chuyện của nhóm nằm trên Telegram, CRM không đọc. Bot giữ chế độ riêng tư và không
              làm quản trị nhóm, nên chỉ nhận lệnh gửi cho bot và tin trả lời tin của bot. Ở đây CRM cho thấy
              nhóm dùng vào việc gì và những tin chính CRM đã đăng vào nhóm.
            </p>
          </div>
        </section>

        <section className="c-card" aria-label="Công dụng của nhóm">
          <div className="c-ch">
            <h2>Công dụng</h2>
            <span className="c-r c-lbl">{st.hint}</span>
          </div>
          <div className="c-cb">
            {lost ? (
              <p className="c-lbl m-0">
                Bot đã rời nhóm này. Thêm bot
                {live.botUsername ? ` @${live.botUsername}` : ""} vào nhóm trên Telegram rồi gán lại công
                dụng.
              </p>
            ) : !live.canManage ? (
              <p className="c-lbl m-0">
                Nhóm này đang dùng cho: <b>{PURPOSE_LABEL[group.purpose] ?? group.purpose}</b>. Chỉ người có
                quyền kết nối (Owner) đổi được công dụng.
              </p>
            ) : (
              <div className="space-y-2" role="radiogroup" aria-label="Công dụng của nhóm">
                {GROUP_PURPOSES.map((p) => (
                  <label key={p.key} className="flex items-start gap-2">
                    <input
                      type="radio"
                      className="mt-1"
                      name={`purpose-${group.chatId}`}
                      disabled={pending}
                      checked={group.purpose === p.key}
                      onChange={() => save(p.key, true)}
                    />
                    <span>
                      <b>{p.label}</b>
                      <span className="c-lbl block">{p.hint}</span>
                    </span>
                  </label>
                ))}
                {group.purpose !== "unused" ? (
                  <button
                    type="button"
                    className="c-btn"
                    disabled={pending}
                    onClick={() => save(group.purpose as GroupPurpose, group.status !== "active")}
                  >
                    {group.status === "active" ? "Tạm ngưng nhóm này" : "Dùng lại nhóm này"}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <section className="c-card" aria-label="Tin CRM đã đăng vào nhóm">
          <div className="c-ch">
            <h2>CRM đã đăng vào nhóm</h2>
            <span className="c-r c-lbl">
              {group.assignedAt ? `Gán ${dateTime(group.assignedAt)}` : "Chưa gán"}
              {group.assignedBy ? ` · ${group.assignedBy}` : ""}
            </span>
          </div>
          <div className="c-cb">
            {group.posts.length === 0 ? (
              <p className="c-lbl m-0">
                CRM chưa đăng tin nào vào nhóm này.
                {group.purpose === "announce"
                  ? " Khi có lead mới, CRM sẽ báo vào đây."
                  : " Nhóm giữ công dụng khác thì CRM chưa tự đăng tin."}
              </p>
            ) : (
              <ul className="m-0 list-none space-y-1.5 p-0">
                {group.posts.map((p, i) => (
                  <li key={`${p.at}-${i}`} className="flex items-center gap-2">
                    <span className="flex-1">{POST_LABEL[p.eventType] ?? p.eventType}</span>
                    <span className="c-lbl">{dateTime(p.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
