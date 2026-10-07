import { CrmShell } from "@/components/crm/shell";
import { signOut } from "../(auth)/login/actions";
import { setMyDuty } from "./team/duty-actions";
import { endViewAs } from "./view-as/actions";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { vnEndOfToday } from "@/lib/format";
import { visibleSettings } from "@/lib/nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [shortcuts, onDuty] = await Promise.all([
    loadShortcuts(user.id, user.permissions),
    user.permissions.has("lead.receive") ? loadOnDuty(user.id) : Promise.resolve(null),
  ]);

  return (
    <CrmShell
      user={{
        id: user.id,
        fullName: user.fullName,
        shortName: user.fullName.split(" ").pop() ?? user.fullName,
        roleName: user.roleName,
        roleKey: user.roleKey,
        showroomName: user.showroomName,
        permissions: [...user.permissions],
        readOnly: Boolean(user.viewAs),
      }}
      settings={visibleSettings(user.permissions)}
      signOutAction={signOut}
      shortcuts={shortcuts}
      liveDuty={onDuty === null ? null : { on: onDuty, set: setMyDuty }}
      banner={
        user.viewAs ? (
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
        ) : null
      }
    >
      {children}
    </CrmShell>
  );
}

// Đang bật Trực: có phiên trực đang mở (CLAUDE.md mục 9.2).
async function loadOnDuty(userId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("duty_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("ended_at", null);
  return Boolean(count);
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
