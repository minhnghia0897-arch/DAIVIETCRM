import { AccountMenu } from "@/components/shell/account-menu";
import { Bell } from "@/components/shell/bell";
import { DualClock } from "@/components/shell/dual-clock";
import { TabBar } from "@/components/shell/tab-bar";
import { ToastProvider } from "@/components/ui/toast";
import { signOut } from "../(auth)/login/actions";
import { endViewAs } from "./view-as/actions";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { formatDateTime, vnEndOfToday } from "@/lib/format";
import { visibleSettings, visibleTabs } from "@/lib/nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: market }, { data: notifications }, shortcuts] = await Promise.all([
    supabase
      .from("markets")
      .select("name, timezone")
      .neq("country_code", "VN")
      .eq("is_active", true)
      .order("sort")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("notifications")
      .select("id, title, link, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(20),
    loadShortcuts(user.id, user.permissions),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col pb-11">
      <header className="border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-4 px-4">
          <span className="flex items-center gap-2 font-bold text-brand-strong">
            <span
              aria-hidden
              className="flex size-7 items-center justify-center rounded-control bg-brand text-white"
            >
              ĐV
            </span>
            <span className="hidden sm:inline">Đại Việt</span>
          </span>
          <div className="flex-1" />
          <div className="hidden min-[900px]:block">
            <DualClock second={market ? { label: market.name, timezone: market.timezone } : null} />
          </div>
          <Bell
            items={(notifications ?? []).map((n) => ({
              id: n.id,
              title: n.title,
              link: n.link,
              createdAt: formatDateTime(n.created_at),
              read: n.read_at !== null,
            }))}
          />
          <AccountMenu
            fullName={user.fullName}
            roleName={user.roleName}
            settings={visibleSettings(user.permissions)}
            signOutAction={signOut}
          />
        </div>
      </header>
      <TabBar showroomName={user.showroomName} tabs={visibleTabs(user.permissions)} />
      {user.viewAs ? (
        <form
          action={endViewAs}
          className="flex flex-wrap items-center gap-3 border-b border-warn bg-warn-soft px-4 py-2 text-warn"
        >
          <span className="font-semibold">
            Đang xem như {user.fullName} ({user.roleName}). Chỉ đọc.
          </span>
          <button type="submit" className="font-semibold underline">
            Thoát
          </button>
        </form>
      ) : null}
      <div className="flex-1 bg-linear-to-b from-band to-page to-[220px]">
        <ToastProvider>{children}</ToastProvider>
      </div>
      <footer
        aria-label="Tiện ích"
        className="fixed inset-x-0 bottom-0 z-40 flex h-11 items-center gap-4 overflow-x-auto border-t border-line bg-surface px-4 text-label"
      >
        {shortcuts.map((s) => (
          <span key={s.label} className="whitespace-nowrap">
            {s.label} <b className="tabular">({s.count})</b>
          </span>
        ))}
        <span className="ml-auto whitespace-nowrap text-text-weak">Bản giai đoạn 1</span>
      </footer>
    </div>
  );
}

// Lối tắt theo quyền (DESIGN.md 4, utility bar).
async function loadShortcuts(userId: string, perms: ReadonlySet<string>) {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const endOfDay = vnEndOfToday();
  const items: { label: string; count: number }[] = [];

  const { count: callbacks } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", userId)
    .eq("status", "open")
    .eq("type", "callback")
    .lte("due_at", endOfDay.toISOString());
  items.push({ label: "Hẹn gọi lại hôm nay", count: callbacks ?? 0 });

  const overdue = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .is("first_contact_at", null)
    .lt("sla_due_at", nowIso)
    .not("stage", "in", "(won,lost)");
  if (perms.has("lead.view_all")) {
    const [{ count: unassigned }, { count: overdueTeam }] = await Promise.all([
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .is("assigned_to", null)
        .is("window_wait_until", null)
        .not("stage", "in", "(won,lost)"),
      overdue,
    ]);
    items.push({ label: "Lead chưa phân", count: unassigned ?? 0 });
    items.push({ label: "Quá hạn toàn đội", count: overdueTeam ?? 0 });
  } else {
    const { count: mine } = await overdue.eq("assigned_to", userId);
    items.push({ label: "Lead quá hạn của tôi", count: mine ?? 0 });
  }
  return items;
}
