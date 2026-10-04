"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ClipboardCheck, Pause, Play, ScrollText, Search, Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { AccountMenu } from "@/components/shell/account-menu";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { AI_SUGGESTIONS, aiAnswer, type AiAnswer, type AiView } from "@/lib/demo/ai-answers";
import { HOUSES, houseById } from "@/lib/demo/crm-data";
import { visibleTabs } from "@/lib/nav";
import { ApprovalList, FeedList } from "./parts";
import { ShellContext } from "./shell-context";
import { CrmProvider, fmtMinutes, useCrm } from "./store";

// Khung ứng dụng theo bản mẫu: thanh trên (tìm kiếm, đồng hồ đôi, trợ lý AI, chuông, tài khoản),
// thanh tab, vùng nội dung kèm khung trợ lý AI bên phải, thanh tiện ích dưới cùng.
// Dùng chung cho bản thật (app/(app)/layout.tsx) và bản demo tĩnh (layout.demo.tsx).

export interface ShellUser {
  fullName: string;
  /** Tên gọi ngắn, khớp cột "người phụ trách" của dữ liệu mô phỏng. */
  shortName: string;
  roleName: string;
  roleKey: string;
  showroomName: string;
  permissions: string[];
}

export { useShell } from "./shell-context";

export function CrmShell(props: {
  user: ShellUser;
  settings: { href: string; label: string }[];
  signOutAction: () => void | Promise<void>;
  /** Dải thông báo dưới thanh tab, ví dụ chế độ "Xem như người dùng". */
  banner?: React.ReactNode;
  /** Lối tắt thêm vào thanh tiện ích. */
  shortcuts?: { label: string; count: number }[];
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <CrmProvider>
        <ShellInner {...props} />
      </CrmProvider>
    </ToastProvider>
  );
}

const VIEW_BY_PATH: [string, AiView][] = [
  ["/home", "home"],
  ["/opportunities", "opps"],
  ["/households", "house"],
  ["/deliveries", "orders"],
  ["/inbox", "convos"],
  ["/channels", "channels"],
  ["/reports", "reports"],
  ["/agents", "agents"],
];

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();

const WIDE = "(min-width: 1250px)";
const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const isWide = () => window.matchMedia(WIDE).matches;

interface AiMessage {
  id: number;
  question: string;
  answer: AiAnswer;
}

function ShellInner({
  user,
  settings,
  signOutAction,
  banner,
  shortcuts,
  children,
}: Parameters<typeof CrmShell>[0]) {
  const { state, act } = useCrm();
  const toast = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const perms = useMemo(() => new Set(user.permissions), [user.permissions]);
  const can = useCallback((p: string) => perms.has(p), [perms]);
  const view: AiView = VIEW_BY_PATH.find(([p]) => pathname.startsWith(p))?.[1] ?? "other";

  // Màn hình rộng: mở sẵn trợ lý AI như bản mẫu; màn hình hẹp: khung AI là lớp phủ, chỉ mở khi bấm.
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const [aiPref, setAiPref] = useState<boolean | null>(null);
  const aiOpen = aiPref ?? wide;
  const setAiOpen = (v: boolean | ((o: boolean) => boolean)) =>
    setAiPref(typeof v === "function" ? v(aiOpen) : v);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [pop, setPop] = useState<"appr" | "feed" | null>(null);
  const [q, setQ] = useState("");
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const ask = useCallback(
    (question: string) => {
      const s = latest.current;
      const answer = aiAnswer(question, {
        view,
        revenue: s.revenue,
        minutes: fmtMinutes(s.minutes),
        autoCount: s.autoCount,
        opps: s.opps,
        oppSel: s.oppSel,
        houseSel: s.houseSel,
        deliveries: s.deliveries,
        delSel: s.delSel,
        convs: s.convs,
      });
      setAiPref(true);
      setMessages((m) => [...m, { id: (m.at(-1)?.id ?? 0) + 1, question, answer }]);
    },
    [view],
  );

  const me = user.shortName;
  // Quyền chỉ Owner (không cấp được) dùng để nhận ra Owner, không suy từ tên vai trò.
  const isOwner = perms.has("settings.permissions");
  const roleKey = user.roleKey;
  const shell = useMemo(
    () => ({ perms, can, ask, me, isOwner, roleKey }),
    [perms, can, ask, me, isOwner, roleKey],
  );

  const tabs = visibleTabs(perms);

  function search(text: string) {
    const t = fold(text);
    if (!t) return;
    const house = HOUSES.find(
      (h) => fold(h.name).includes(t) || h.members.some((m) => fold(m.name).includes(t)),
    );
    if (house) {
      act({ type: "selectHouse", id: house.id }, `Mở ${house.name}`);
      router.push("/households");
      return;
    }
    const d = state.deliveries.find((x) => fold(x.id).includes(t) || fold(x.buyer).includes(t));
    if (d) {
      act({ type: "selectDelivery", id: d.id }, `Mở đơn ${d.id}`);
      router.push("/deliveries");
      return;
    }
    toast(`Không tìm thấy "${text}"`, "err");
  }

  const ctxLine = (() => {
    if (view === "house") return `Đang xem: ${houseById(state.houseSel)?.name}`;
    if (view === "opps")
      return `Đang xem: cơ hội ${state.opps.find((o) => o.id === state.oppSel)?.name ?? ""}`;
    if (view === "orders") return `Đang xem: đơn ${state.delSel}`;
    if (view === "convos")
      return `Đang xem: hội thoại ${state.convs.find((c) => c.id === state.convSel)?.name}`;
    return "Đọc dữ liệu showroom Quận 4 theo quyền của bạn";
  })();

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex min-h-full flex-1 flex-col pb-11">
        <header className="c-gh">
          <span className="flex items-center gap-2 font-bold text-brand-strong">
            <span
              aria-hidden
              className="flex size-7 items-center justify-center rounded-control bg-brand text-white"
            >
              ĐV
            </span>
            <span className="hidden sm:inline">Đại Việt</span>
          </span>
          <form
            role="search"
            className="c-search"
            onSubmit={(e) => {
              e.preventDefault();
              search(q);
            }}
          >
            <Search size={14} aria-hidden />
            <input
              aria-label="Tìm kiếm"
              placeholder="Tìm hộ gia đình, khách, mã đơn…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
          <span className="c-tz ml-auto" aria-label="Giờ mô phỏng">
            VN <b>{fmtMinutes(state.minutes)}</b> · Hàn <b>{fmtMinutes(state.minutes + 120)}</b>
          </span>
          <button
            type="button"
            className={`c-ib ${aiOpen ? "is-on" : ""}`}
            aria-label="Trợ lý AI"
            aria-pressed={aiOpen}
            onClick={() => setAiOpen((o) => !o)}
          >
            <Sparkles size={18} />
          </button>
          <button
            type="button"
            className="c-ib"
            aria-label={`Chờ duyệt: ${state.queue.length}`}
            onClick={() => setPop((p) => (p === "appr" ? null : "appr"))}
          >
            <Bell size={18} />
            {state.queue.length ? <span className="c-badge">{state.queue.length}</span> : null}
          </button>
          <AccountMenu
            fullName={user.fullName}
            roleName={user.roleName}
            settings={settings}
            signOutAction={signOutAction}
          />
        </header>
        <nav className="c-nav" aria-label="Ứng dụng">
          <span className="c-appname">
            <span className="c-waffle" aria-hidden>
              {Array.from({ length: 9 }, (_, i) => (
                <i key={i} />
              ))}
            </span>
            {user.showroomName}
          </span>
          {tabs.map((t) => {
            const active = pathname === t.href || pathname.startsWith(t.href + "/");
            return (
              <Link key={t.href} href={t.href} className="c-tab" aria-current={active ? "page" : undefined}>
                {t.label}
              </Link>
            );
          })}
        </nav>
        {banner}
        <div className="flex-1 bg-linear-to-b from-band to-page to-[220px]">
          <div className="c-shell">
            <div className="c-main">{children}</div>
            {aiOpen ? (
              <aside className="c-card c-ai" aria-label="Trợ lý AI">
                <div className="c-aih">
                  <span className="c-oi is-round is-sm" style={{ background: "var(--ai)" }} aria-hidden>
                    <Sparkles />
                  </span>
                  <b>Trợ lý AI</b>
                  <span className="c-pill is-ai">Bản thử</span>
                  <button
                    type="button"
                    className="c-ib ml-auto"
                    aria-label="Đóng trợ lý AI"
                    onClick={() => setAiOpen(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="c-ctx">{ctxLine}</div>
                <div className="c-msgs" aria-live="polite">
                  {messages.length === 0 ? (
                    <div className="c-ma">
                      <p>
                        Chào {user.shortName}, tôi đọc dữ liệu trong phạm vi quyền của bạn và chỉ đề xuất; mọi
                        việc gửi đi đều cần người bấm xác nhận.
                      </p>
                    </div>
                  ) : null}
                  {messages.map((m) => (
                    <div key={m.id} className="contents">
                      <div className="c-mu">{m.question}</div>
                      <div className="c-ma">
                        {m.answer.paragraphs.map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                        {m.answer.bars ? (
                          <div className="mt-1">
                            {m.answer.bars.map(([label, v]) => (
                              <div
                                key={label}
                                className="c-hbar"
                                style={{ gridTemplateColumns: "1fr 90px 34px" }}
                              >
                                <span>{label}</span>
                                <i>
                                  <u style={{ width: `${v}%`, background: "var(--ai)" }} />
                                </i>
                                <span className="tabular">{v}%</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {m.answer.draft ? (
                          <>
                            <div className="c-draft">{m.answer.draft}</div>
                            {can("message.zalo_send") ? (
                              <button
                                type="button"
                                className="c-btn is-ai"
                                onClick={() => toast("Đã gửi qua Zalo OA")}
                              >
                                <Send size={13} className="mr-1 inline" aria-hidden />
                                Gửi qua Zalo
                              </button>
                            ) : (
                              <span className="c-lbl">Bạn chưa có quyền gửi tin Zalo.</span>
                            )}
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="c-sug" aria-label="Câu hỏi gợi ý">
                  {AI_SUGGESTIONS[view].map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
                <AiInput onAsk={ask} />
              </aside>
            ) : null}
          </div>
        </div>

        {pop ? (
          <div
            className="c-card c-pop"
            role="dialog"
            aria-label={pop === "appr" ? "Chờ duyệt" : "Nhật ký agent"}
          >
            <div className="c-ch">
              <h2>{pop === "appr" ? `Chờ duyệt (${state.queue.length})` : "Nhật ký agent"}</h2>
              <span className="c-r">
                <button type="button" className="c-ib" aria-label="Đóng" onClick={() => setPop(null)}>
                  <X size={16} />
                </button>
              </span>
            </div>
            {pop === "appr" ? (
              <ApprovalList items={state.queue} />
            ) : (
              <FeedList items={state.feed} limit={20} />
            )}
          </div>
        ) : null}

        <footer className="c-util" aria-label="Tiện ích">
          <button type="button" onClick={() => setPop((p) => (p === "appr" ? null : "appr"))}>
            <ClipboardCheck size={15} aria-hidden />
            <span className="c-lbltxt">Chờ duyệt</span>
            <span className="c-cnt">{state.queue.length}</span>
          </button>
          <button type="button" onClick={() => setPop((p) => (p === "feed" ? null : "feed"))}>
            <ScrollText size={15} aria-hidden />
            <span className="c-lbltxt">Nhật ký agent</span>
          </button>
          {can("settings.integrations") ? (
            <button
              type="button"
              onClick={() =>
                act({ type: "togglePause" }, state.paused ? "Agent chạy tiếp" : "Đã tạm dừng agent")
              }
            >
              {state.paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
              <span className="c-lbltxt">{state.paused ? "Chạy tiếp agent" : "Tạm dừng agent"}</span>
            </button>
          ) : null}
          {shortcuts?.map((s) => (
            <span key={s.label} className="flex items-center px-3 text-label whitespace-nowrap">
              {s.label}&nbsp;<b className="tabular">({s.count})</b>
            </span>
          ))}
          <span className="ml-auto flex items-center px-2 text-label whitespace-nowrap text-text-weak">
            Dữ liệu mô phỏng
          </span>
        </footer>
      </div>
    </ShellContext.Provider>
  );
}

function AiInput({ onAsk }: { onAsk: (q: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="c-aiin"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAsk(text.trim());
        setText("");
      }}
    >
      <input
        aria-label="Hỏi trợ lý AI"
        placeholder="Hỏi về khách, đơn, đội…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="c-btn is-ai">
        Hỏi
      </button>
    </form>
  );
}
