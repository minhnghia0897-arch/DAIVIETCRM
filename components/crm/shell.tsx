"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
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
import { STAGES, houseById } from "@/lib/demo/crm-data";
import { visibleCustomers } from "@/lib/demo/repo";
import { NAV_SECTIONS, NAV_TABS, SETTINGS_ITEMS, visibleTabs } from "@/lib/nav";
import { CUSTOMERS } from "@/lib/demo/data";
import { ApprovalList, FeedList } from "./parts";
import { QuickSwitcher, type QuickItem } from "./quick-switcher";
import { slaStats } from "./views/lead-intake";
import { ShellContext } from "./shell-context";
import { ORDER_STATUS } from "@/lib/demo/labels";
import { visibleChats, visibleConvs, visibleHouses, visibleOpps, visibleQueue } from "./access";
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
  /** Đang "Xem như người dùng": chỉ đọc, mọi thao tác ghi bị chặn. */
  readOnly?: boolean;
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
  const { user } = props;
  const who = useMemo(
    () => ({
      perms: new Set(user.permissions),
      me: user.shortName,
      userId: user.id,
      // Quyền chỉ Owner (không cấp được) dùng để nhận ra Owner, không suy từ tên vai trò.
      isOwner: user.permissions.includes("settings.permissions"),
      readOnly: Boolean(user.readOnly),
    }),
    [user.permissions, user.shortName, user.id, user.readOnly],
  );
  return (
    <ToastProvider>
      <CrmProvider who={who}>
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
  "/chat": Send,
  "/channels": Megaphone,
  "/reports": BarChart3,
  "/agents": Bot,
  "/products": Package,
  "/inventory": Package,
  "/policies": Package,
  "/team": UsersRound,
  "/customers": Contact,
};

interface TrailStep {
  path: string;
  opp: string;
  house: string;
}

const normPath = (p: string) => p.replace(/\/+$/, "") || "/";

/** Tên màn để ghi trên nút Quay lại: "đơn Q4-2610-0012", "lead Nguyễn Thị Thu", "Việc cần làm"… */
function trailLabel(step: TrailStep, s: ReturnType<typeof useCrm>["state"]): string {
  const [, root, id] = step.path.split("/");
  if (root === "orders" && id) return `đơn ${s.orders.find((o) => o.id === id)?.code ?? ""}`.trim();
  if (root === "customers" && id) return `khách ${CUSTOMERS.find((c) => c.id === id)?.fullName ?? ""}`.trim();
  if (root === "opportunities") {
    const o = s.opps.find((x) => x.id === step.opp);
    return o ? `lead ${o.name}` : "Cơ hội";
  }
  if (root === "households") return houseById(step.house)?.name ?? "Hộ gia đình";
  if (root === "products" && id) return "sản phẩm";
  if (root === "team" && step.path.includes("/people/")) return "hiệu suất";
  const tab = [...NAV_TABS.flatMap((t) => [t, ...(t.children ?? [])]), ...SETTINGS_ITEMS].find(
    (t) => t.href === step.path,
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

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();

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

function ShellInner({
  user,
  settings,
  signOutAction,
  banner,
  shortcuts,
  children,
}: Parameters<typeof CrmShell>[0]) {
  const { state, act, who } = useCrm();
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
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const ask = useCallback(
    (question: string) => {
      const s = latest.current;
      // Trợ lý chạy dưới quyền người hỏi: chỉ nhận dữ liệu người đó được xem (CLAUDE.md 10.7).
      const opps = visibleOpps(s, who);
      const houses = visibleHouses(s, who);
      const answer = aiAnswer(question, {
        view,
        revenue: s.revenue,
        minutes: fmtMinutes(s.minutes),
        autoCount: s.autoCount,
        opps,
        oppSel: opps.some((o) => o.id === s.oppSel) ? s.oppSel : (opps[0]?.id ?? ""),
        houseSel: houses.some((h) => h.id === s.houseSel) ? s.houseSel : (houses[0]?.id ?? ""),
        team: perms.has("report.team"),
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
        convs: visibleConvs(s, who),
      });
      setAiPref(true);
      setMessages((m) => [...m, { id: (m.at(-1)?.id ?? 0) + 1, question, answer }]);
    },
    [view, perms, pathname, user.id, who],
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
    const left: TrailStep = { path: normPath(trailAt), opp: state.oppSel, house: state.houseSel };
    const cur = normPath(pathname);
    setTrailAt(pathname);
    setTrail((t) => (t.at(-1)?.path === cur ? t.slice(0, -1) : [...t, left].slice(-20)));
  }
  const prev = trail.at(-1);
  const back = useMemo(() => {
    if (!prev) return null;
    const label = trailLabel(prev, state);
    return {
      label,
      go: () => {
        // Trả lại lead, hộ đang chọn lúc rời màn đó rồi lùi lịch sử trình duyệt.
        if (prev.path === "/opportunities" && prev.opp) act({ type: "selectOpp", id: prev.opp });
        if (prev.path === "/households" && prev.house) act({ type: "selectHouse", id: prev.house });
        router.back();
      },
    };
  }, [prev, state, act, router]);
  const shell = useMemo(
    () => ({ perms, can, ask, me, isOwner, roleKey, userId: user.id, back }),
    [perms, can, ask, me, isOwner, roleKey, user.id, back],
  );

  const tabs = visibleTabs(perms);
  // Hàng chờ duyệt theo quyền duyệt tương ứng, cộng đề xuất của chính mình (CLAUDE.md 11.1).
  const queue = visibleQueue(state, who);
  // Số đếm kiểu Slack trên sidebar: việc mở của tôi, hội thoại cần người, lead quá SLA.
  const navCounts: Record<string, number> = {
    "/tasks": state.tasks.filter((t) => t.status === "open" && t.owner === me).length,
    "/inbox": visibleConvs(state, who).filter((c) => c.status === "need").length,
    // Tin chưa đọc trong các nhóm nội bộ mình tham gia.
    "/chat": visibleChats(state, who).reduce(
      (n, c) =>
        n +
        c.topics.reduce(
          (k, t) => k + Math.max(0, t.messages.length - (state.chatSeen[`${c.id}/${t.id}`] ?? 0)),
          0,
        ),
      0,
    ),
  };
  // Mục "chưa đọc" kiểu Slack: in đậm khi có việc mới so với lần cuối rời trang đó (đang mở thì không đậm).
  const activity: Record<string, number> = {
    ...navCounts,
    "/opportunities": visibleOpps(state, who).filter((o) => o.stage === 0).length,
  };
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
  const duty = state.receivers.some((r) => r.name === me)
    ? Boolean(state.receivers.find((r) => r.name === me)?.onDuty)
    : null;
  const sla = slaStats(state);
  const group = tabs.find((t) =>
    t.children?.some((c) => pathname === c.href || pathname.startsWith(c.href + "/")),
  );

  const GO: Record<string, string> = {
    h: "/home",
    t: "/tasks",
    c: "/opportunities",
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
        if (tabs.some((t) => t.href === href || t.children?.some((c) => c.href === href))) router.push(href);
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
      run: () => router.push(t.href),
    }));
    const leads: QuickItem[] = visibleOpps(state, who).map((o) => ({
      id: `l${o.id}`,
      label: o.name,
      hint: `${o.product} · ${STAGES[o.stage]}${o.owner ? ` · ${o.owner}` : ""}`,
      group: "Lead" as const,
      run: () => {
        act({ type: "selectOpp", id: o.id });
        router.push("/opportunities");
      },
    }));
    const orders: QuickItem[] = visibleOrders(state.orders, perms, user.id).map((o) => ({
      id: `o${o.id}`,
      label: o.code,
      hint: `${orderPeople(o).buyer} · ${ORDER_STATUS[o.status].label}`,
      group: "Đơn hàng" as const,
      run: () => router.push(`/orders/${o.id}`),
    }));
    const houses: QuickItem[] = visibleHouses(state, who).map((h) => ({
      id: `h${h.id}`,
      label: h.name,
      hint: h.members.map((m) => m.name).join(", "),
      group: "Hộ gia đình" as const,
      run: () => {
        act({ type: "selectHouse", id: h.id });
        router.push("/households");
      },
    }));
    const customers: QuickItem[] = visibleCustomers({ id: user.id, permissions: perms }).map((c) => ({
      id: `c${c.id}`,
      label: c.fullName,
      hint: `Khách · ${c.phoneMasked}`,
      group: "Khách" as const,
      run: () => router.push(`/customers/${c.id}`),
    }));
    return [...pages, ...leads, ...orders, ...houses, ...customers];
  }

  function search(text: string) {
    const t = fold(text);
    if (!t) return;
    const house = visibleHouses(state, who).find(
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
    return "Đọc dữ liệu showroom Quận 4 theo quyền của anh chị";
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
              placeholder="Tìm hộ gia đình, khách, mã đơn…"
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
            aria-label={`Chờ duyệt: ${queue.length}`}
            onClick={() => setPop((p) => (p === "appr" ? null : "appr"))}
          >
            <Bell size={18} />
            {queue.length ? <span className="c-badge">{queue.length}</span> : null}
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
          <div className="min-w-0 flex-1 bg-page">
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
              <h2>{pop === "appr" ? `Chờ duyệt (${queue.length})` : "Nhật ký agent"}</h2>
              <span className="c-r">
                <button type="button" className="c-ib" aria-label="Đóng" onClick={() => setPop(null)}>
                  <X size={16} />
                </button>
              </span>
            </div>
            {pop === "appr" ? <ApprovalList items={queue} /> : <FeedList items={state.feed} limit={20} />}
          </div>
        ) : null}

        {quick ? (
          <QuickSwitcher items={quickItems()} showHelp={quick === "help"} onClose={() => setQuick(null)} />
        ) : null}

        <footer className="c-util" aria-label="Tiện ích">
          <button type="button" onClick={() => setPop((p) => (p === "appr" ? null : "appr"))}>
            <ClipboardCheck size={15} aria-hidden />
            <span className="c-lbltxt">Chờ duyệt</span>
            <span className="c-cnt">{queue.length}</span>
          </button>
          {can("lead.view_all") ? (
            <button type="button" onClick={() => setPop((p) => (p === "feed" ? null : "feed"))}>
              <ScrollText size={15} aria-hidden />
              <span className="c-lbltxt">Nhật ký agent</span>
            </button>
          ) : null}
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
