"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  Bot,
  ClipboardCheck,
  Contact,
  House,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Menu,
  MessageCircle,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  ScrollText,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  Target,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { AccountMenu } from "@/components/shell/account-menu";
import { Switch } from "@/components/ui/switch";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { AI_SUGGESTIONS, aiAnswer, type AiAnswer, type AiView } from "@/lib/demo/ai-answers";
import { HOUSES, houseById } from "@/lib/demo/crm-data";
import { NAV_SECTIONS, visibleTabs } from "@/lib/nav";
import { ApprovalList, FeedList } from "./parts";
import { slaStats } from "./views/lead-intake";
import { ShellContext } from "./shell-context";
import { ORDER_STATUS } from "@/lib/demo/labels";
import { CrmProvider, fmtMinutes, orderPeople, orderRisks, useCrm, visibleOrders } from "./store";

// Khung ứng dụng theo bản mẫu: thanh trên (tìm kiếm, đồng hồ đôi, trợ lý AI, chuông, tài khoản),
// thanh tab, vùng nội dung kèm khung trợ lý AI bên phải, thanh tiện ích dưới cùng.
// Dùng chung cho bản thật (app/(app)/layout.tsx) và bản demo tĩnh (layout.demo.tsx).

export interface ShellUser {
  id: string;
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
  ["/orders", "orders"],
  ["/inbox", "convos"],
  ["/channels", "channels"],
  ["/reports", "reports"],
  ["/agents", "agents"],
];

/** Biểu tượng của từng mục trong sidebar, theo đường dẫn của tab. */
const NAV_ICON: Record<string, LucideIcon> = {
  "/home": LayoutDashboard,
  "/tasks": ListChecks,
  "/opportunities": Target,
  "/households": House,
  "/orders": ShoppingCart,
  "/inbox": MessageCircle,
  "/channels": Megaphone,
  "/reports": BarChart3,
  "/agents": Bot,
  "/products": Package,
  "/inventory": Package,
  "/policies": Package,
  "/team": UsersRound,
  "/customers": Contact,
};

const NAV_KEY = "dv_nav_collapsed";
const navListeners = new Set<() => void>();
const subscribeNav = (cb: () => void) => {
  navListeners.add(cb);
  return () => navListeners.delete(cb);
};
// Bộ nhớ cục bộ bị chặn thì nhớ trong phiên.
let navCollapsedMem = false;
function readNavCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_KEY) === "1";
  } catch {
    return navCollapsedMem;
  }
}
function writeNavCollapsed(v: boolean) {
  navCollapsedMem = v;
  try {
    localStorage.setItem(NAV_KEY, v ? "1" : "0");
  } catch {
    // Không ghi được thì dùng bộ nhớ trong phiên.
  }
  navListeners.forEach((cb) => cb());
}

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
  // Sidebar: màn hình rộng thu gọn được còn biểu tượng (nhớ trong trình duyệt); màn hình hẹp mở dạng ngăn kéo.
  const collapsed = useSyncExternalStore(subscribeNav, readNavCollapsed, () => false);
  function toggleCollapsed() {
    writeNavCollapsed(!collapsed);
  }
  // Ngăn kéo menu trên điện thoại gắn với trang đang mở: đổi trang thì tự đóng.
  const [navOpenAt, setNavOpenAt] = useState<string | null>(null);
  const navOpen = navOpenAt === pathname;
  const setNavOpen = (v: boolean | ((o: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(navOpen) : v;
    setNavOpenAt(next ? pathname : null);
  };
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
        orders: visibleOrders(s.orders, perms, user.id).map((o) => {
          const p = orderPeople(o);
          return {
            id: o.id,
            code: o.code,
            buyer: p.buyer,
            recipient: p.self ? p.buyer : p.recipient,
            status: ORDER_STATUS[o.status].label,
            risks: orderRisks(o),
          };
        }),
        orderSel: pathname.match(/^\/orders\/([^/]+)/)?.[1],
        convs: s.convs,
      });
      setAiPref(true);
      setMessages((m) => [...m, { id: (m.at(-1)?.id ?? 0) + 1, question, answer }]);
    },
    [view, perms, pathname, user.id],
  );

  const me = user.shortName;
  // Quyền chỉ Owner (không cấp được) dùng để nhận ra Owner, không suy từ tên vai trò.
  const isOwner = perms.has("settings.permissions");
  const roleKey = user.roleKey;
  const shell = useMemo(
    () => ({ perms, can, ask, me, isOwner, roleKey, userId: user.id }),
    [perms, can, ask, me, isOwner, roleKey, user.id],
  );

  const tabs = visibleTabs(perms);
  // Số đếm kiểu Slack trên sidebar: việc mở của tôi, hội thoại cần người, lead quá SLA.
  const navCounts: Record<string, number> = {
    "/tasks": state.tasks.filter((t) => t.status === "open" && t.owner === me).length,
    "/inbox": state.convs.filter((c) => c.status === "need").length,
  };
  const duty = state.receivers.some((r) => r.name === me)
    ? Boolean(state.receivers.find((r) => r.name === me)?.onDuty)
    : null;
  const sla = slaStats(state);
  const group = tabs.find((t) =>
    t.children?.some((c) => pathname === c.href || pathname.startsWith(c.href + "/")),
  );

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
    const d = visibleOrders(state.orders, perms, user.id).find(
      (x) => fold(x.code).includes(t) || fold(orderPeople(x).buyer).includes(t),
    );
    if (d) {
      toast(`Mở đơn ${d.code}`);
      router.push(`/orders/${d.id}`);
      return;
    }
    toast(`Không tìm thấy "${text}"`, "err");
  }

  const ctxLine = (() => {
    if (view === "house") return `Đang xem: ${houseById(state.houseSel)?.name}`;
    if (view === "opps")
      return `Đang xem: cơ hội ${state.opps.find((o) => o.id === state.oppSel)?.name ?? ""}`;
    if (view === "orders") {
      const id = pathname.match(/^\/orders\/([^/]+)/)?.[1];
      const o = id ? state.orders.find((x) => x.id === id) : undefined;
      return o ? `Đang xem: đơn ${o.code}` : "Đang xem: danh sách đơn hàng";
    }
    if (view === "convos")
      return `Đang xem: hội thoại ${state.convs.find((c) => c.id === state.convSel)?.name}`;
    return "Đọc dữ liệu showroom Quận 4 theo quyền của bạn";
  })();

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex min-h-full flex-1 flex-col pb-11">
        <header className="c-gh">
          <button
            type="button"
            className="c-ib c-menubtn"
            aria-label="Mở menu"
            aria-expanded={navOpen}
            aria-controls="c-sidenav"
            onClick={() => setNavOpen((o) => !o)}
          >
            <Menu size={18} />
          </button>
          <span className="flex items-center gap-2 font-bold text-white">
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
          {can("lead.receive") && state.receivers.some((r) => r.name === me) ? (
            <label className="flex items-center gap-1.5 text-label whitespace-nowrap">
              <Switch
                label="Đang trực"
                checked={Boolean(state.receivers.find((r) => r.name === me)?.onDuty)}
                onCheckedChange={(v) =>
                  act(
                    { type: "toggleDuty", name: me, actor: me },
                    v ? "Đã bật trực, bắt đầu nhận lead" : "Đã tắt trực, không nhận lead mới",
                  )
                }
              />
              <span className="hidden sm:inline">Trực</span>
            </label>
          ) : null}
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
        {banner}
        <div className="c-frame">
          {navOpen ? (
            <button
              type="button"
              className="c-navscrim"
              aria-label="Đóng menu"
              onClick={() => setNavOpen(false)}
            />
          ) : null}
          <nav
            id="c-sidenav"
            className={`c-nav ${collapsed ? "is-collapsed" : ""} ${navOpen ? "is-open" : ""}`}
            aria-label="Ứng dụng"
          >
            <div className="c-appname" title={user.showroomName}>
              <span className="c-navlogo" aria-hidden>
                Q4
              </span>
              <span className="c-navtxt min-w-0">
                <b className="block truncate">{user.showroomName}</b>
                {duty !== null ? (
                  <span className={`c-navduty ${duty ? "is-on" : ""}`}>
                    <i aria-hidden />
                    {duty ? "Đang trực" : "Không trực"}
                  </span>
                ) : null}
              </span>
            </div>
            {NAV_SECTIONS.map((sec) => {
              const items = tabs.filter((t) => t.section === sec.key);
              if (!items.length) return null;
              return (
                <div key={sec.key} className="c-navsec">
                  <span className="c-navhead c-navtxt">{sec.label}</span>
                  {items.map((t) => {
                    const active = (t.children?.map((c) => c.href) ?? [t.href]).some(
                      (h) => pathname === h || pathname.startsWith(h + "/"),
                    );
                    const Icon = NAV_ICON[t.href] ?? Package;
                    const count = navCounts[t.href] ?? 0;
                    return (
                      <Link
                        key={t.href}
                        href={t.href}
                        className="c-tab"
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? t.label : undefined}
                        aria-description={count ? `${count} cần xử lý` : undefined}
                      >
                        <Icon size={16} strokeWidth={2.25} aria-hidden />
                        <span className="c-navtxt flex-1 truncate">{t.label}</span>
                        {count ? (
                          <span className="c-navcnt" aria-hidden>
                            {count}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
            <button
              type="button"
              className="c-navfold"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
            >
              {collapsed ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
              <span className="c-navtxt">Thu gọn</span>
            </button>
          </nav>
          <div className="min-w-0 flex-1 bg-page">
            <div className="c-shell">
              <div className="c-main">
                {group && group.children!.length > 1 ? (
                  <nav aria-label={group.label} className="mb-3 flex flex-wrap gap-1.5">
                    {group.children!.map((c) => {
                      const on = pathname === c.href || pathname.startsWith(c.href + "/");
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          aria-current={on ? "page" : undefined}
                          className={`c-btn ${on ? "is-brand" : ""}`}
                        >
                          {c.label}
                        </Link>
                      );
                    })}
                  </nav>
                ) : null}
                {children}
              </div>
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
                          Chào {user.shortName}, tôi đọc dữ liệu trong phạm vi quyền của bạn và chỉ đề xuất;
                          mọi việc gửi đi đều cần người bấm xác nhận.
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
          {can("lead.view_all") ? (
            <Link
              href="/home"
              className="flex items-center gap-1.5 border-r border-line-2 px-3 text-label whitespace-nowrap"
            >
              <span className="c-lbltxt">Quá SLA</span>
              <span className={`c-cnt ${sla.overdue.length ? "" : "opacity-40"}`}>{sla.overdue.length}</span>
              <span className="c-lbltxt">· Chưa phân</span>
              <span className={`c-cnt ${sla.unassigned.length ? "" : "opacity-40"}`}>
                {sla.unassigned.length}
              </span>
            </Link>
          ) : null}
          {can("settings.integrations") &&
          Object.values(state.settings.integrationStates).some((x) => x.status === "error") ? (
            <Link
              href="/settings/integrations"
              className="flex items-center gap-1.5 border-r border-line-2 px-3 text-label whitespace-nowrap text-err"
            >
              <span className="c-lbltxt">Đấu nối lỗi</span>
              <span className="c-cnt">
                {Object.values(state.settings.integrationStates).filter((x) => x.status === "error").length}
              </span>
            </Link>
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
