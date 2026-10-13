import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../db/types.ts";
import { LEAD_STAGE_LABEL, leadSourceLabel } from "../../leads/labels.ts";
import { shortCustomer, type NotifyLevel } from "../../notify/events.ts";
import { maskPhonesInText } from "../../phone/index.ts";
import { ORDER_STATUS_LIVE } from "../../sales/order-labels.ts";
import { TASK_TYPE_LABEL } from "../../tasks/labels.ts";
import type { InlineButton } from "./api.ts";

// Lệnh xem nhanh trên Telegram (Owner chốt 13/10/2026): /viec, /lead, /giaohang, /cskh. Bot trả lời vào tin riêng của
// người hỏi, chỉ những gì người đó được xem trên CRM (theo quyền, như RLS của các màn tương ứng). Không bao giờ có số
// điện thoại, địa chỉ chi tiết hay nội dung tin của khách (CLAUDE.md mục 5, 12); tên khách chỉ ở dạng tên gọi ngắn và
// chỉ khi người đó chọn mức Chi tiết hoặc Đầy đủ ở Cài đặt, Thông báo Telegram. Nút dưới tin mở thẳng màn CRM.

type Db = SupabaseClient<Database>;

export type BotCommand = "viec" | "lead" | "giaohang" | "cskh";

/** Menu lệnh đăng ký với Telegram (setMyCommands) khi Owner kết nối bot. */
export const BOT_COMMANDS: { command: BotCommand; description: string }[] = [
  { command: "viec", description: "Việc hôm nay của tôi" },
  { command: "lead", description: "Lead 3 ngày gần nhất" },
  { command: "giaohang", description: "Đơn giao trong 7 ngày" },
  { command: "cskh", description: "Khách cần chăm sóc 3 ngày gần nhất" },
];

export const isBotCommand = (c: string): c is BotCommand => BOT_COMMANDS.some((x) => x.command === c);

export interface CommandReply {
  text: string;
  keyboard: InlineButton[][];
}

interface Viewer {
  userId: string;
  showroomId: string;
  level: NotifyLevel;
  can: (perm: string) => boolean;
}

const PERMS = [
  "lead.view_all",
  "lead.view_own",
  "order.view_all",
  "order.view_own",
  "message.view_all",
  "message.zalo_send",
  "message.messenger_send",
];

/** Người CRM đã liên kết với tài khoản Telegram này (null khi chưa liên kết hoặc tài khoản CRM đã khóa). */
async function viewerOf(db: Db, telegramUserId: number): Promise<Viewer | null> {
  const { data: userId } = await db.rpc("telegram_user", { p_telegram_user_id: telegramUserId });
  if (!userId) return null;
  const [{ data: profile }, { data: prefs }, ...perms] = await Promise.all([
    db.from("profiles").select("showroom_id").eq("id", userId).maybeSingle(),
    db.from("notification_prefs").select("level").eq("user_id", userId).maybeSingle(),
    ...PERMS.map((perm) => db.rpc("has_perm_for", { uid: userId, perm })),
  ]);
  if (!profile) return null;
  const allowed = new Set(PERMS.filter((_, i) => perms[i]?.data === true));
  return {
    userId,
    showroomId: profile.showroom_id,
    level: (prefs?.level as NotifyLevel | undefined) ?? "short",
    can: (p) => allowed.has(p),
  };
}

// --- Giờ Việt Nam (UTC+7, không đổi giờ theo mùa) ---

const DAY = 86_400_000;
const VN = 7 * 3_600_000;

/** Đầu ngày theo giờ VN, cộng thêm `addDays` ngày. */
export function vnDayStart(now: Date, addDays = 0): Date {
  return new Date((Math.floor((now.getTime() + VN) / DAY) + addDays) * DAY - VN);
}
/** "2026-10-13" theo giờ VN (so với cột date như deliveries.scheduled_on). */
const vnDate = (d: Date) => new Date(d.getTime() + VN).toISOString().slice(0, 10);
const fmt = (o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false, ...o });
const hhmmF = fmt({ hour: "2-digit", minute: "2-digit" });
const hhmm = (iso: string) => hhmmF.format(new Date(iso));
/** "13/10" theo giờ VN. Không dùng Intl vi-VN cho ngày vì tùy bản ICU nó ra "13-10" hoặc "13/10". */
const ddmm = (iso: string) => {
  const d = vnDate(new Date(iso));
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
};
/** Giờ nếu là hôm nay, ngày nếu là hôm khác. */
const when = (iso: string, now: Date) =>
  vnDate(new Date(iso)) === vnDate(now) ? hhmm(iso) : `${ddmm(iso)} ${hhmm(iso)}`;

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Tên gọi ngắn của khách theo mức người nhận chọn: Rút gọn thì không ghi tên. */
function nameFor(v: Viewer, c: { full_name?: string | null; country_of_residence?: string | null } | null) {
  if (v.level === "short" || !c?.full_name) return null;
  return shortCustomer(c.full_name, c.country_of_residence ?? undefined);
}

const LIMIT = 15;
const SHORT_NOTE = "\n\nMức Rút gọn nên không ghi tên khách; đổi ở CRM → Cài đặt → Thông báo Telegram.";

function more(total: number) {
  return total > LIMIT ? `\n… còn ${total - LIMIT} nữa, mở CRM để xem hết.` : "";
}

/** Nút mở từng dòng, xếp mỗi hàng 3 nút cho dễ bấm trên điện thoại. */
function linkRows(items: { text: string; url: string }[], perRow = 3): InlineButton[][] {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  return rows;
}

const noPerm = (what: string): CommandReply => ({
  text: `Anh chị chưa được cấp quyền xem ${what} trên CRM.`,
  keyboard: [],
});

// ---------------------------------------------------------------------------
// /viec — toàn bộ việc trong ngày của người hỏi (quá hạn và hạn hôm nay)
// ---------------------------------------------------------------------------

async function viec(db: Db, v: Viewer, now: Date, base: string | null): Promise<CommandReply> {
  const start = vnDayStart(now).toISOString();
  const end = vnDayStart(now, 1).toISOString();
  const [{ data: open }, { count: done }] = await Promise.all([
    db
      .from("tasks")
      .select(
        "id, type, title, due_at, leads(contacts!leads_contact_id_fkey(full_name, country_of_residence)), contacts(full_name, country_of_residence)",
      )
      .eq("assigned_to", v.userId)
      .eq("status", "open")
      .lt("due_at", end)
      .order("due_at")
      .limit(50),
    db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", v.userId)
      .eq("status", "done")
      .gte("done_at", start),
  ]);
  const tasks = open ?? [];
  const overdue = tasks.filter((t) => t.due_at < now.toISOString()).length;
  const head = `Việc hôm nay ${ddmm(now.toISOString())} · ${tasks.length} việc${overdue ? ` (${overdue} quá hạn)` : ""}${done ? ` · đã xong ${done}` : ""}`;
  if (!tasks.length)
    return {
      text: `Việc hôm nay ${ddmm(now.toISOString())}${done ? ` · đã xong ${done}` : ""}\nAnh chị không còn việc nào trong hôm nay.`,
      keyboard: base ? [[{ text: "Mở Việc cần làm", url: `${base}/tasks` }]] : [],
    };

  const lines = tasks.slice(0, LIMIT).map((t, i) => {
    const contact = one(t.contacts) ?? one(one(t.leads)?.contacts ?? null);
    const name = nameFor(v, contact);
    // Mức Đầy đủ ghi tiêu đề việc (đã che số); hai mức kia ghi loại việc và tên gọi ngắn.
    const what =
      v.level === "full"
        ? maskPhonesInText(t.title)
        : `${TASK_TYPE_LABEL[t.type] ?? "Việc"}${name ? ` · ${name}` : ""}`;
    const late = t.due_at < now.toISOString();
    return `${i + 1}. ${t.due_at < start ? ddmm(t.due_at) : hhmm(t.due_at)} ${what}${late ? " (quá hạn)" : ""}`;
  });
  // Làm nhanh ngay trên Telegram: Xong, Dời 1 giờ cho 5 việc đầu (cùng hàm task_action như trên CRM).
  const quick: InlineButton[][] = tasks.slice(0, 5).map((t, i) => [
    { text: `${i + 1}. Xong`, callback_data: `t:done:${t.id}` },
    { text: `${i + 1}. Dời 1 giờ`, callback_data: `t:snz:${t.id}` },
  ]);
  return {
    text: `${head}\n${lines.join("\n")}${more(tasks.length)}${v.level === "short" ? SHORT_NOTE : ""}`,
    keyboard: [...quick, ...(base ? [[{ text: "Mở Việc cần làm", url: `${base}/tasks` }]] : [])],
  };
}

// ---------------------------------------------------------------------------
// /lead — lead mới vào hoặc mới được giao trong 3 ngày gần nhất
// ---------------------------------------------------------------------------

async function lead(db: Db, v: Viewer, now: Date, base: string | null): Promise<CommandReply> {
  const team = v.can("lead.view_all");
  if (!team && !v.can("lead.view_own")) return noPerm("lead");
  const since = new Date(now.getTime() - 3 * DAY).toISOString();
  let q = db
    .from("leads")
    .select(
      "id, stage, source, created_at, sla_due_at, first_contact_at, assigned_to, contacts!leads_contact_id_fkey(full_name, country_of_residence)",
    )
    .eq("showroom_id", v.showroomId)
    .is("deleted_at", null)
    .or(`created_at.gte.${since},assigned_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (!team) q = q.eq("assigned_to", v.userId);
  const { data } = await q;
  const leads = data ?? [];
  const head = `Lead 3 ngày gần nhất${team ? " của cả showroom" : " của tôi"} · ${leads.length} lead`;
  if (!leads.length) return { text: `${head}\nChưa có lead nào trong 3 ngày qua.`, keyboard: [] };

  const holders = new Map<string, string>();
  if (team) {
    const ids = [...new Set(leads.map((l) => l.assigned_to).filter((x): x is string => Boolean(x)))];
    if (ids.length) {
      const { data: people } = await db.from("profiles").select("id, full_name").in("id", ids);
      for (const p of people ?? []) holders.set(p.id, p.full_name.trim().split(/\s+/).pop() ?? p.full_name);
    }
  }
  const shown = leads.slice(0, LIMIT);
  const lines = shown.map((l, i) => {
    const name = nameFor(v, one(l.contacts));
    const sla =
      !l.first_contact_at && l.sla_due_at
        ? l.sla_due_at < now.toISOString()
          ? " · quá hạn gọi"
          : ` · gọi trước ${hhmm(l.sla_due_at)}`
        : "";
    const who = team ? ` · ${l.assigned_to ? (holders.get(l.assigned_to) ?? "đã giao") : "chưa giao"}` : "";
    return `${i + 1}. ${name ? `${name} · ` : ""}${LEAD_STAGE_LABEL[l.stage] ?? l.stage}${sla} · ${leadSourceLabel(l.source)}${who}`;
  });
  return {
    text: `${head}\n${lines.join("\n")}${more(leads.length)}${v.level === "short" ? SHORT_NOTE : ""}`,
    keyboard: base
      ? linkRows(
          shown.slice(0, 9).map((l, i) => ({ text: `Mở lead ${i + 1}`, url: `${base}/leads/${l.id}` })),
        )
      : [],
  };
}

// ---------------------------------------------------------------------------
// /giaohang — đơn hẹn giao trong 7 ngày tới, đơn đang giao hoặc sẵn sàng giao, đơn đã lắp trong 7 ngày qua
// ---------------------------------------------------------------------------

const DELIVERY_STATUSES = [
  "confirmed",
  "deposit_paid",
  "ready_to_ship",
  "delivering",
  "installed",
  "completed",
];

async function giaohang(db: Db, v: Viewer, now: Date, base: string | null): Promise<CommandReply> {
  const team = v.can("order.view_all");
  if (!team && !v.can("order.view_own")) return noPerm("đơn hàng");
  let q = db
    .from("orders")
    .select(
      "id, code, status, ship_province, seller_id, recipient:contacts!orders_recipient_contact_id_fkey(full_name, country_of_residence), deliveries(scheduled_on, installed_at)",
    )
    .eq("showroom_id", v.showroomId)
    .is("deleted_at", null)
    .in("status", DELIVERY_STATUSES)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!team) q = q.eq("seller_id", v.userId);
  const { data } = await q;

  const today = vnDate(now);
  const weekEnd = vnDate(vnDayStart(now, 7));
  const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString();
  type Row = NonNullable<typeof data>[number] & { sched: string | null; installedAt: string | null };
  const rows: Row[] = (data ?? [])
    .map((o) => {
      const d = one(o.deliveries);
      return { ...o, sched: d?.scheduled_on ?? null, installedAt: d?.installed_at ?? null };
    })
    .filter((o) => {
      const done = ["installed", "completed"].includes(o.status);
      if (done) return Boolean(o.installedAt && o.installedAt >= weekAgo);
      if (o.sched) return o.sched < weekEnd; // hẹn trong 7 ngày tới, hoặc đã trễ hẹn mà chưa giao
      return ["ready_to_ship", "delivering"].includes(o.status); // sẵn sàng, đang giao mà chưa hẹn ngày
    })
    .sort((a, b) => (a.sched ?? "9999").localeCompare(b.sched ?? "9999"));

  const head = `Giao hàng 7 ngày${team ? " của cả showroom" : " đơn của tôi"} · ${rows.length} đơn`;
  if (!rows.length) return { text: `${head}\nKhông có đơn nào cần giao trong 7 ngày tới.`, keyboard: [] };
  const shown = rows.slice(0, LIMIT);
  const lines = shown.map((o, i) => {
    const name = nameFor(v, one(o.recipient));
    const done = ["installed", "completed"].includes(o.status);
    const date = done
      ? o.installedAt
        ? ` · lắp ${ddmm(o.installedAt)}`
        : ""
      : o.sched
        ? ` · hẹn ${o.sched.slice(8, 10)}/${o.sched.slice(5, 7)}${o.sched < today ? " (trễ hẹn)" : ""}`
        : " · chưa hẹn ngày";
    return `${i + 1}. ${o.code}${name ? ` · ${name}` : ""}${o.ship_province ? ` · ${o.ship_province}` : ""} · ${ORDER_STATUS_LIVE[o.status]?.label ?? o.status}${date}`;
  });
  return {
    text: `${head}\n${lines.join("\n")}${more(rows.length)}${v.level === "short" ? SHORT_NOTE : ""}`,
    keyboard: base
      ? linkRows(
          shown.slice(0, 8).map((o) => ({ text: `Mở ${o.code}`, url: `${base}/orders/${o.id}` })),
          2,
        )
      : [],
  };
}

// ---------------------------------------------------------------------------
// /cskh — khách cần chăm sóc trong 3 ngày gần nhất: khách nhắn chưa ai trả lời, việc chăm sóc tới hạn.
// Bấm nút mở thẳng hội thoại của khách trên CRM để xem và trả lời.
// ---------------------------------------------------------------------------

const CARE_TYPES = [
  "post_delivery_call",
  "consumable_reminder",
  "warranty_followup",
  "occasion_reminder",
  "reactivation",
];
const CHANNEL: Record<string, string> = { messenger: "Messenger", zalo: "Zalo" };

interface CareItem {
  key: string;
  at: string;
  name: string | null;
  what: string;
  convId: string | null;
  contactId: string | null;
}

async function cskh(db: Db, v: Viewer, now: Date, base: string | null): Promise<CommandReply> {
  const since = new Date(now.getTime() - 3 * DAY).toISOString();
  const end = vnDayStart(now, 1).toISOString();
  const seeInbox = v.can("message.view_all") || v.can("message.zalo_send") || v.can("message.messenger_send");
  const items: CareItem[] = [];

  // 1. Khách nhắn trong 3 ngày mà tin cuối vẫn là của khách (chưa ai trả lời), hội thoại chưa đánh dấu xong.
  if (seeInbox) {
    const { data: convs } = await db
      .from("conversations")
      .select(
        "id, channel, display_name, last_inbound_at, lead_id, assigned_to, contact_id, contacts(full_name, country_of_residence), leads(assigned_to)",
      )
      .eq("showroom_id", v.showroomId)
      .neq("status", "done")
      .gte("last_inbound_at", since)
      .order("last_inbound_at", { ascending: false })
      .limit(100);
    // Người không có message.view_all chỉ thấy hội thoại của lead mình giữ, hoặc khách đang hỏi giao cho mình (RLS).
    const mine = (convs ?? []).filter((c) =>
      v.can("message.view_all")
        ? true
        : c.lead_id
          ? one(c.leads)?.assigned_to === v.userId
          : c.assigned_to === v.userId,
    );
    if (mine.length) {
      const { data: msgs } = await db
        .from("messages")
        .select("conversation_id, direction")
        .in(
          "conversation_id",
          mine.map((c) => c.id),
        )
        .order("occurred_at", { ascending: false })
        .limit(500);
      const last = new Map<string, string>();
      for (const m of msgs ?? []) if (!last.has(m.conversation_id)) last.set(m.conversation_id, m.direction);
      for (const c of mine) {
        if (last.get(c.id) !== "in" || !c.last_inbound_at) continue;
        const contact = one(c.contacts) ?? { full_name: c.display_name, country_of_residence: null };
        items.push({
          key: c.contact_id ?? c.id,
          at: c.last_inbound_at,
          name: nameFor(v, contact),
          what: `${CHANNEL[c.channel] ?? c.channel} · khách nhắn ${when(c.last_inbound_at, now)}, chưa trả lời`,
          convId: c.id,
          contactId: c.contact_id,
        });
      }
    }
  }

  // 2. Việc chăm sóc (gọi hỏi thăm sau giao, nhắc thay lõi, bảo hành, dịp tặng, làm nóng lại) tới hạn trong 3 ngày.
  let tq = db
    .from("tasks")
    .select("id, type, due_at, contact_id, contacts(full_name, country_of_residence)")
    .eq("showroom_id", v.showroomId)
    .eq("status", "open")
    .in("type", CARE_TYPES)
    .gte("due_at", since)
    .lt("due_at", end)
    .order("due_at")
    .limit(100);
  if (!v.can("lead.view_all")) tq = tq.eq("assigned_to", v.userId);
  const { data: tasks } = await tq;
  const seen = new Set(items.map((i) => i.key));
  const taskItems = (tasks ?? []).filter((t) => !t.contact_id || !seen.has(t.contact_id));
  // Hội thoại gần nhất của khách để nút mở thẳng vào đó.
  const contactIds = [...new Set(taskItems.map((t) => t.contact_id).filter((x): x is string => Boolean(x)))];
  const convOf = new Map<string, string>();
  if (contactIds.length && seeInbox) {
    const { data: cv } = await db
      .from("conversations")
      .select("id, contact_id, last_message_at")
      .in("contact_id", contactIds)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    for (const c of cv ?? []) if (c.contact_id && !convOf.has(c.contact_id)) convOf.set(c.contact_id, c.id);
  }
  for (const t of taskItems) {
    items.push({
      key: t.contact_id ?? t.id,
      at: t.due_at,
      name: nameFor(v, one(t.contacts)),
      what: `${TASK_TYPE_LABEL[t.type] ?? "Chăm sóc"} · hạn ${ddmm(t.due_at)}${t.due_at < now.toISOString() ? " (quá hạn)" : ""}`,
      convId: t.contact_id ? (convOf.get(t.contact_id) ?? null) : null,
      contactId: t.contact_id,
    });
  }

  const head = `Khách cần chăm sóc · 3 ngày gần nhất · ${items.length} khách`;
  if (!items.length)
    return { text: `${head}\nKhông có khách nào cần chăm sóc trong 3 ngày gần nhất.`, keyboard: [] };
  const shown = items.slice(0, LIMIT);
  const lines = shown.map((it, i) => `${i + 1}. ${it.name ? `${it.name} · ` : ""}${it.what}`);
  const buttons = shown
    .slice(0, 9)
    .map((it, i) =>
      it.convId
        ? { text: `Hội thoại ${i + 1}`, url: `${base}/inbox?c=${it.convId}` }
        : it.contactId
          ? { text: `Hồ sơ ${i + 1}`, url: `${base}/customers/${it.contactId}` }
          : null,
    )
    .filter((b): b is { text: string; url: string } => b !== null);
  return {
    text: `${head}\n${lines.join("\n")}${more(items.length)}${v.level === "short" ? SHORT_NOTE : ""}`,
    keyboard: base ? linkRows(buttons) : [],
  };
}

const RUN: Record<BotCommand, (db: Db, v: Viewer, now: Date, base: string | null) => Promise<CommandReply>> =
  { viec, lead, giaohang, cskh };

/**
 * Chạy một lệnh cho người dùng Telegram. Trả null khi tài khoản Telegram chưa liên kết với CRM (hoặc CRM đã khóa).
 * `base` là địa chỉ CRM cho nút mở (null thì không có nút link).
 */
export async function runBotCommand(
  db: Db,
  telegramUserId: number,
  cmd: BotCommand,
  base: string | null,
  now = new Date(),
): Promise<CommandReply | null> {
  const v = await viewerOf(db, telegramUserId);
  if (!v) return null;
  return RUN[cmd](db, v, now, base);
}
