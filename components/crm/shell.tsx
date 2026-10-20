"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Clapperboard,
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
  UserPlus,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import { AccountMenu } from "@/components/shell/account-menu";
import { Switch } from "@/components/ui/switch";
import { ToastProvider, useToast } from "@/components/ui/toast";
import type { AiAnswer, AiView } from "@/lib/demo/ai-answers";
import { IS_DEMO, NAV_SECTIONS, NAV_TABS, SETTINGS_ITEMS, isLiveScreen, visibleTabs } from "@/lib/nav";
import type { NoticeFeed } from "@/lib/notify/notice";
import { NavProgress } from "./nav-progress";
import { NoticeList } from "./notices";
import { QuickSwitcher, type QuickItem } from "./quick-switcher";
import { ShellContext } from "./shell-context";
import { useLiveChanges } from "@/lib/db/use-live-changes";
import { navStart } from "@/lib/nav-progress";

// Khung ứng dụng theo bản mẫu: thanh trên (tìm kiếm, đồng hồ đôi, trợ lý AI, chuông, tài khoản),
// thanh tab, vùng nội dung kèm khung trợ lý AI bên phải, thanh tiện ích dưới cùng.
// Khung này không đọc kho dữ liệu mô phỏng: bản thật (CrmLiveShell, app/(app)/layout.tsx) dùng giờ thật, số đếm và
// thông báo thật; bản demo (CrmShell trong demo-shell.tsx) cắm thêm phần mô phỏng qua `useDemo` (DemoBits). Nhờ vậy
// trang thật không phải tải kho mô phỏng và các thư viện đi kèm.

export interface ShellUser {
  id: string;
  fullName: string;
  /** Tên gọi ngắn, khớp cột "người phụ trách" của dữ liệu mô phỏng. */
  shortName: string;
  roleName: string;
  roleKey: string;
  showroomName: string;
  permissions: string[];
  /** Đang "Xem như người dùng": chỉ đọc, mọi thao tác ghi bị chặn. */
  readOnly?: boolean;
}

export { useShell } from "./shell-context";

/** Phần mô phỏng của khung (bản demo): đồng hồ giả lập, số đếm, trợ lý AI thử, hàng chờ duyệt, nhật ký agent… */
export interface DemoBits {
  clock: { vn: string; kr: string; label: string };
  navCounts: Record<string, number>;
  activity: Record<string, number>;
  duty: boolean | null;
  toggleDuty: (on: boolean) => void;
  trailExtra: () => { opp: string; house: string };
  trailLabel: (step: TrailStep) => string | null;
  restore: (step: TrailStep) => void;
  answer: (question: string, view: AiView, pathname: string) => AiAnswer;
  suggestions: (view: AiView) => string[];
  ctxLine: (view: AiView, pathname: string) => string;
  quickItems: () => QuickItem[];
  search: (text: string) => boolean;
  queueCount: number;
  approvals: React.ReactNode;
  feed: React.ReactNode;
  paused: boolean;
  togglePause: () => void;
  sla: { overdue: number; unassigned: number };
  integrationErrors: number;
}

export interface ShellProps {
  user: ShellUser;
  settings: { href: string; label: string }[];
  signOutAction: () => void | Promise<void>;
  /** Dải thông báo dưới thanh tab, ví dụ chế độ "Xem như người dùng". */
  banner?: React.ReactNode;
  /** Lối tắt thêm vào thanh tiện ích. */
  shortcuts?: { label: string; count: number }[];
  /** Bản demo tĩnh: mọi màn đều là dữ liệu mô phỏng. */
  allDemo?: boolean;
  /** Bản thật: trạng thái Trực đọc từ duty_sessions và công tắc gọi server (bản demo dùng dữ liệu mô phỏng). */
  liveDuty?: { on: boolean; set: (on: boolean) => Promise<{ ok: boolean; message: string }> } | null;
  /** Bản thật: chuông đọc bảng notifications của chính mình (bản demo dùng hàng chờ duyệt mô phỏng). */
  liveNotices?: {
    initial: NoticeFeed;
    load: () => Promise<NoticeFeed>;
    markRead: (ids?: string[]) => Promise<void>;
  } | null;
  /** Bọc phần nội dung (bản thật: nạp kho mô phỏng cho màn còn mô phỏng). */
  wrapContent?: (children: React.ReactNode) => React.ReactNode;
  children: React.ReactNode;
}

/** Khung của bản thật: không có phần mô phỏng. */
export function CrmLiveShell(props: ShellProps) {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      <ShellFrame {...props} useDemo={useNoDemo} />
    </ToastProvider>
  );
}

function useNoDemo(): DemoBits | null {
  return null;
}

const tzTime = (tz: string, d: Date) =>
  d.toLocaleTimeString("vi-VN", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
const subscribeMinute = (cb: () => void) => {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
};
const minuteNow = () => Math.floor(Date.now() / 60_000);

/** Giờ thật Việt Nam và Hàn Quốc, cập nhật mỗi phút. */
function useRealClock() {
  const m = useSyncExternalStore(subscribeMinute, minuteNow, () => 0);
  if (!m) return { vn: "--:--", kr: "--:--", label: "Giờ hiện tại" };
  const d = new Date(m * 60_000);
  return { vn: tzTime("Asia/Ho_Chi_Minh", d), kr: tzTime("Asia/Seoul", d), label: "Giờ hiện tại" };
}

const LIVE_AI_NOTE: AiAnswer = {
  paragraphs: [
    "Trợ lý AI trên dữ liệu thật đang được chuẩn bị (dự kiến tháng 3). Hiện trợ lý chỉ chạy thử trên bản demo với dữ liệu mô phỏng.",
  ],
};

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
  "/leads": UserPlus,
  "/opportunities": Target,
  "/households": House,
  "/orders": ShoppingCart,
  "/inbox": MessageCircle,
  "/chat": Send,
  "/channels": Megaphone,
  "/marketing": Megaphone,
  "/campaigns": Megaphone,
  "/content": Megaphone,
  "/landing-pages": Megaphone,
  "/reports": BarChart3,
  "/agents": Bot,
  "/products": Package,
  "/gifts": Package,
  "/inventory": Package,
  "/policies": Package,
  "/team": UsersRound,
  "/customers": Contact,
  "/kol": Clapperboard,
};

export interface TrailStep {
  path: string;
  opp: string;
  house: string;
}

const normPath = (p: string) => p.replace(/\/+$/, "") || "/";

/** Tên màn để ghi trên nút Quay lại theo tên tab ("Việc cần làm"…); bản demo ghi rõ lead, đơn, hộ. */
function tabLabel(path: string): string {
  if (/^\/orders\/[^/]+/.test(path)) return "đơn hàng";
  if (/^\/customers\/[^/]+/.test(path)) return "khách";
  if (/^\/leads\/[^/]+/.test(path)) return "lead";
  if (/^\/products\/[^/]+/.test(path)) return "sản phẩm";
  if (path.includes("/team/people/")) return "hiệu suất";
  const tab = [...NAV_TABS.flatMap((t) => [t, ...(t.children ?? [])]), ...SETTINGS_ITEMS].find(
    (t) => t.href === path,
  );
  return tab?.label ?? "trang trước";
}

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

// Trợ lý AI mở sẵn chỉ trên màn hình thật rộng; laptop để toàn bộ chiều ngang cho nội dung, bấm nút AI để mở.
const WIDE = "(min-width: 1600px)";
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

export function ShellFrame({
  user,
  settings,
  signOutAction,
  banner,
  shortcuts,
  allDemo,
  liveDuty,
  liveNotices,
  wrapContent,
  useDemo,
  children,
}: ShellProps & { useDemo: () => DemoBits | null }) {
  const demo = useDemo();
  const toast = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const perms = useMemo(() => new Set(user.permissions), [user.permissions]);
  const can = useCallback((p: string) => perms.has(p), [perms]);
  const view: AiView = VIEW_BY_PATH.find(([p]) => pathname.startsWith(p))?.[1] ?? "other";
  // Nhắc "Dữ liệu mô phỏng" chỉ ở màn chưa nối database, để nhãn này còn đáng tin.
  const demoData = Boolean(allDemo) || !isLiveScreen(pathname);

  // Màn hình rộng: mở sẵn trợ lý AI như bản mẫu; màn hình hẹp: khung AI là lớp phủ, chỉ mở khi bấm.
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const [aiPref, setAiPref] = useState<boolean | null>(null);
  const aiOpen = aiPref ?? wide;
  const setAiOpen = (v: boolean | ((o: boolean) => boolean)) =>
    setAiPref(typeof v === "function" ? v(aiOpen) : v);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [pop, setPop] = useState<"appr" | "feed" | "notices" | null>(null);
  const [notices, setNotices] = useState<NoticeFeed | null>(liveNotices?.initial ?? null);
  // Trang tải lại từ server (đổi trang, router.refresh) mang số mới nhất: dùng luôn, khỏi chờ lần hỏi tiếp.
  const [seenInitial, setSeenInitial] = useState(liveNotices?.initial);
  if (liveNotices && liveNotices.initial !== seenInitial) {
    setSeenInitial(liveNotices.initial);
    setNotices(liveNotices.initial);
  }
  // Thông báo mới: Realtime báo khi bảng notifications đổi (RLS chỉ gửi thông báo của mình), rồi tải lại danh sách;
  // vẫn hỏi lại khi quay lại tab và mỗi 5 phút phòng mất kết nối.
  useLiveChanges(
    "notices",
    [{ table: "notifications" }],
    () => {
      liveNotices
        ?.load()
        .then(setNotices)
        .catch(() => undefined);
    },
    { enabled: Boolean(liveNotices) },
  );
  function readNotices(ids?: string[]) {
    if (!liveNotices || user.readOnly) return;
    setNotices((f) =>
      f
        ? {
            items: f.items.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)),
            unread: ids
              ? Math.max(0, f.unread - f.items.filter((n) => ids.includes(n.id) && !n.read).length)
              : 0,
          }
        : f,
    );
    void liveNotices.markRead(ids);
  }
  const [q, setQ] = useState("");
  // Ô tìm nhanh Ctrl/⌘ K và phím tắt kiểu Slack.
  const [quick, setQuick] = useState<"search" | "help" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const goPrefix = useRef(0);
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
  const ask = useCallback(
    (question: string) => {
      // Trợ lý chạy dưới quyền người hỏi: chỉ nhận dữ liệu người đó được xem (CLAUDE.md 10.7).
      const answer = demo ? demo.answer(question, view, pathname) : LIVE_AI_NOTE;
      setAiPref(true);
      setMessages((m) => [...m, { id: (m.at(-1)?.id ?? 0) + 1, question, answer }]);
    },
    [demo, view, pathname],
  );

  const me = user.shortName;
  // Quyền chỉ Owner (không cấp được) dùng để nhận ra Owner, không suy từ tên vai trò.
  const isOwner = perms.has("settings.permissions");
  const roleKey = user.roleKey;
  // Đường đi giữa các nghiệp vụ (lead → đơn → khách…): mỗi lần đổi trang ghi lại màn vừa rời kèm lead, hộ
  // đang chọn; đi lùi (nút Quay lại hoặc nút lùi của trình duyệt) thì bỏ bước cuối. Cập nhật khi đổi trang.
  const [trail, setTrail] = useState<TrailStep[]>([]);
  const [trailAt, setTrailAt] = useState(pathname);
  if (trailAt !== pathname) {
    const left: TrailStep = { path: normPath(trailAt), ...(demo?.trailExtra() ?? { opp: "", house: "" }) };
    const cur = normPath(pathname);
    setTrailAt(pathname);
    setTrail((t) => (t.at(-1)?.path === cur ? t.slice(0, -1) : [...t, left].slice(-20)));
  }
  const prev = trail.at(-1);
  const back = useMemo(() => {
    if (!prev) return null;
    const label = demo?.trailLabel(prev) ?? tabLabel(prev.path);
    return {
      label,
      go: () => {
        // Trả lại lead, hộ đang chọn lúc rời màn đó (bản demo) rồi lùi lịch sử trình duyệt.
        demo?.restore(prev);
        router.back();
      },
    };
  }, [prev, demo, router]);
  const shell = useMemo(
    () => ({ perms, can, ask, me, isOwner, roleKey, userId: user.id, back }),
    [perms, can, ask, me, isOwner, roleKey, user.id, back],
  );

  const tabs = visibleTabs(perms);
  // Số đếm kiểu Slack trên sidebar (bản demo); bản thật chưa đếm trên menu, số thật nằm ở thanh tiện ích.
  const navCounts: Record<string, number> = demo?.navCounts ?? {};
  // Mục "chưa đọc" kiểu Slack: in đậm khi có việc mới so với lần cuối rời trang đó (đang mở thì không đậm).
  const activity: Record<string, number> = demo?.activity ?? {};
  const hrefOf = (p: string) => tabs.find((t) => p === t.href || p.startsWith(t.href + "/"))?.href ?? p;
  const [seenPath, setSeenPath] = useState(pathname);
  const [seen, setSeen] = useState<Record<string, number>>({});
  if (seenPath !== pathname) {
    // Rời một trang thì coi như đã xem số việc của trang đó (cập nhật khi đổi trang, không dùng effect).
    const left = hrefOf(seenPath);
    setSeenPath(pathname);
    setSeen((m) => ({ ...m, [left]: activity[left] ?? 0 }));
  }
  const unread = (href: string) => hrefOf(pathname) !== href && (activity[href] ?? 0) > (seen[href] ?? 0);
  const [dutyPending, startDuty] = useTransition();
  const [dutyOptimistic, setDutyOptimistic] = useOptimistic(liveDuty?.on ?? false);
  const duty = liveDuty !== undefined ? (liveDuty ? dutyOptimistic : null) : (demo?.duty ?? null);
  function toggleDuty(v: boolean) {
    if (liveDuty) {
      startDuty(async () => {
        setDutyOptimistic(v);
        const res = await liveDuty.set(v);
        toast(res.message, res.ok ? "ok" : "err");
        router.refresh();
      });
    } else demo?.toggleDuty(v);
  }
  const realClock = useRealClock();
  const clock = demo?.clock ?? realClock;
  const group = tabs.find((t) =>
    t.children?.some((c) => pathname === c.href || pathname.startsWith(c.href + "/")),
  );

  const GO: Record<string, string> = {
    h: "/home",
    t: "/tasks",
    l: "/leads",
    ...(IS_DEMO ? { c: "/opportunities" } : {}),
    d: "/orders",
    k: "/customers",
    i: "/inbox",
  };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuick((v) => (v ? null : "search"));
        return;
      }
      const el = e.target as HTMLElement | null;
      const typing = el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "?") {
        e.preventDefault();
        setQuick("help");
      } else if (e.key.toLowerCase() === "g") {
        goPrefix.current = Date.now();
      } else if (Date.now() - goPrefix.current < 1200 && GO[e.key.toLowerCase()]) {
        goPrefix.current = 0;
        const href = GO[e.key.toLowerCase()];
        if (tabs.some((t) => t.href === href || t.children?.some((c) => c.href === href))) {
          navStart();
          router.push(href);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function quickItems(): QuickItem[] {
    const pages: QuickItem[] = [
      ...tabs.flatMap((t): { href: string; label: string }[] => (t.children?.length ? t.children : [t])),
      ...settings,
    ].map((t) => ({
      id: `p${t.href}`,
      label: t.label,
      hint: t.href.startsWith("/settings") ? "Cài đặt" : "Màn hình",
      group: "Màn hình" as const,
      run: () => {
        navStart();
        router.push(t.href);
      },
    }));
    return [...pages, ...(demo?.quickItems() ?? [])];
  }

  function search(text: string) {
    const t = text.trim();
    if (!t) return;
    if (demo) {
      if (!demo.search(t)) toast(`Không tìm thấy "${text}"`, "err");
      return;
    }
    // Bản thật: tìm lead theo tên khách.
    if (can("lead.view_own") || can("lead.view_all")) {
      navStart();
      router.push(`/leads?q=${encodeURIComponent(t)}`);
    } else toast("Anh chị chưa được cấp quyền xem lead", "err");
  }

  const ctxLine = demo ? demo.ctxLine(view, pathname) : "Trợ lý AI trên dữ liệu thật sẽ có từ tháng 3";

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
          {/* Nút lùi trên thanh đầu như Slack: trả lại màn nghiệp vụ vừa rời. */}
          <button
            type="button"
            className="c-ib c-hback"
            aria-label={back ? `Quay lại ${back.label}` : "Quay lại"}
            title={back ? `Quay lại ${back.label}` : undefined}
            disabled={!back}
            onClick={back?.go}
          >
            <ArrowLeft size={17} />
          </button>
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
              ref={searchRef}
              aria-label="Tìm kiếm"
              placeholder={demo ? "Tìm hộ gia đình, khách, mã đơn…" : "Tìm lead theo tên khách…"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              type="button"
              className="c-search-k"
              aria-label="Mở ô tìm nhanh (Ctrl K)"
              onClick={() => setQuick("search")}
            >
              Ctrl K
            </button>
          </form>
          <span className="c-tz ml-auto" aria-label={clock.label}>
            VN <b>{clock.vn}</b> · Hàn <b>{clock.kr}</b>
          </span>
          {can("lead.receive") && duty !== null ? (
            <label className="flex items-center gap-1.5 text-label whitespace-nowrap">
              <Switch
                label="Đang trực"
                checked={duty}
                disabled={dutyPending || Boolean(user.readOnly)}
                onCheckedChange={toggleDuty}
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
          {notices ? (
            <button
              type="button"
              className="c-ib"
              aria-label={`Thông báo: ${notices.unread} chưa đọc`}
              onClick={() => setPop((p) => (p === "notices" ? null : "notices"))}
            >
              <Bell size={18} />
              {notices.unread ? (
                <span className="c-badge">{notices.unread > 99 ? "99+" : notices.unread}</span>
              ) : null}
            </button>
          ) : (
            <button
              type="button"
              className="c-ib"
              aria-label={`Chờ duyệt: ${demo?.queueCount ?? 0}`}
              onClick={() => setPop((p) => (p === "appr" ? null : "appr"))}
            >
              <Bell size={18} />
              {demo?.queueCount ? <span className="c-badge">{demo.queueCount}</span> : null}
            </button>
          )}
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
                        className={`c-tab ${!active && unread(t.href) ? "is-unread" : ""}`}
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
          <div className="min-w-0 flex-1 bg-page tgx">
            <div className="c-shell">
              <div className="c-main">
                {group && group.children!.length > 1 ? (
                  <nav aria-label={group.label} className="c-ftabs mb-4">
                    {group.children!.map((c) => {
                      const on = pathname === c.href || pathname.startsWith(c.href + "/");
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          aria-current={on ? "page" : undefined}
                          className="c-ftab"
                        >
                          {c.label}
                        </Link>
                      );
                    })}
                  </nav>
                ) : null}
                {wrapContent ? wrapContent(children) : children}
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
                          Chào {user.shortName}, tôi đọc dữ liệu trong phạm vi quyền của anh chị và chỉ đề
                          xuất; mọi việc gửi đi đều cần người bấm xác nhận.
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
                              {/* Nháp AI không gửi thẳng: người dùng gửi từ hồ sơ khách hoặc hội thoại, nơi server
                                  kiểm đồng ý theo mục đích và kênh, giữ bất ngờ (CLAUDE.md mục 5, 10.7). */}
                              <button
                                type="button"
                                className="c-btn is-ai"
                                onClick={() => {
                                  void navigator.clipboard?.writeText(m.answer.draft ?? "").catch(() => {});
                                  toast("Đã chép bản nháp. Gửi từ hồ sơ khách để hệ thống kiểm đồng ý trước");
                                }}
                              >
                                <Send size={13} className="mr-1 inline" aria-hidden />
                                Chép bản nháp
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="c-sug" aria-label="Câu hỏi gợi ý">
                    {(demo?.suggestions(view) ?? []).map((s) => (
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
            aria-label={pop === "appr" ? "Chờ duyệt" : pop === "notices" ? "Thông báo" : "Nhật ký agent"}
          >
            <div className="c-ch">
              <h2>
                {pop === "appr"
                  ? `Chờ duyệt (${demo?.queueCount ?? 0})`
                  : pop === "notices"
                    ? `Thông báo${notices?.unread ? ` (${notices.unread} chưa đọc)` : ""}`
                    : "Nhật ký agent"}
              </h2>
              <span className="c-r">
                <button type="button" className="c-ib" aria-label="Đóng" onClick={() => setPop(null)}>
                  <X size={16} />
                </button>
              </span>
            </div>
            {pop === "appr" ? (
              demo?.approvals
            ) : pop === "notices" && notices ? (
              <NoticeList
                items={notices.items}
                onOpen={(n) => {
                  if (!n.read) readNotices([n.id]);
                  setPop(null);
                }}
                onReadAll={() => readNotices()}
              />
            ) : (
              demo?.feed
            )}
          </div>
        ) : null}

        {quick ? (
          <QuickSwitcher items={quickItems()} showHelp={quick === "help"} onClose={() => setQuick(null)} />
        ) : null}

        <footer className="c-util" aria-label="Tiện ích">
          {demo ? (
            <button type="button" onClick={() => setPop((p) => (p === "appr" ? null : "appr"))}>
              <ClipboardCheck size={15} aria-hidden />
              <span className="c-lbltxt">Chờ duyệt</span>
              <span className="c-cnt">{demo.queueCount}</span>
            </button>
          ) : null}
          {demo && can("lead.view_all") ? (
            <button type="button" onClick={() => setPop((p) => (p === "feed" ? null : "feed"))}>
              <ScrollText size={15} aria-hidden />
              <span className="c-lbltxt">Nhật ký agent</span>
            </button>
          ) : null}
          {demo && can("settings.integrations") ? (
            <button type="button" onClick={demo.togglePause}>
              {demo.paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
              <span className="c-lbltxt">{demo.paused ? "Chạy tiếp agent" : "Tạm dừng agent"}</span>
            </button>
          ) : null}
          {demo && can("lead.view_all") ? (
            <Link
              href="/home"
              className="flex items-center gap-1.5 border-r border-line-2 px-3 text-label whitespace-nowrap"
            >
              <span className="c-lbltxt">Quá SLA</span>
              <span className={`c-cnt ${demo.sla.overdue ? "" : "opacity-40"}`}>{demo.sla.overdue}</span>
              <span className="c-lbltxt">· Chưa phân</span>
              <span className={`c-cnt ${demo.sla.unassigned ? "" : "opacity-40"}`}>
                {demo.sla.unassigned}
              </span>
            </Link>
          ) : null}
          {demo && can("settings.integrations") && demo.integrationErrors ? (
            <Link
              href="/settings/integrations"
              className="flex items-center gap-1.5 border-r border-line-2 px-3 text-label whitespace-nowrap text-err"
            >
              <span className="c-lbltxt">Đấu nối lỗi</span>
              <span className="c-cnt">{demo.integrationErrors}</span>
            </Link>
          ) : null}
          {shortcuts?.map((s) => (
            <span key={s.label} className="flex items-center px-3 text-label whitespace-nowrap">
              {s.label}&nbsp;<b className="tabular">({s.count})</b>
            </span>
          ))}
          {demoData ? (
            <span className="ml-auto flex items-center px-2 text-label whitespace-nowrap text-text-weak">
              Dữ liệu mô phỏng
            </span>
          ) : null}
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
