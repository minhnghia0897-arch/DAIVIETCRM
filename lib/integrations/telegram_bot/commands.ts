import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../db/types.ts";
import { LEAD_STAGE_LABEL, leadSourceLabel } from "../../leads/labels.ts";
import { shortCustomer, type NotifyLevel } from "../../notify/events.ts";
import { maskPhonesInText } from "../../phone/index.ts";
import { LIFECYCLE_LABEL, type LifecycleStage } from "../../cdp/lifecycle.ts";
import { formatMoney } from "../../format.ts";
import { ORDER_STATUS_LIVE } from "../../sales/order-labels.ts";
import { TASK_TYPE_LABEL } from "../../tasks/labels.ts";
import type { InlineButton } from "./api.ts";
import { windowText } from "./window-text.ts";

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

/** Tên riêng của nhân viên ("Nguyễn Thị Thảo" → "Thảo"), để ghi người giữ lead, người bán. */
const staffName = (full: string) => full.trim().split(/\s+/).pop() ?? full;

async function staffNames(db: Db, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const { data } = await db.from("profiles").select("id, full_name").in("id", uniq);
  for (const p of data ?? []) out.set(p.id, staffName(p.full_name));
  return out;
}

/** Khoảng thời gian dễ đọc: "40 phút", "3 giờ", "2 ngày". */
export function span(ms: number): string {
  const m = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  if (m < 60) return `${m} phút`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} giờ` : `${Math.round(h / 24)} ngày`;
}

const LIMIT = 15;
/** Telegram nhận tối đa 4096 ký tự mỗi tin; chừa chỗ cho dòng "còn N nữa" và ghi chú cuối. */
const MAX_TEXT = 3800;
const SHORT_NOTE = "\n\nMức Rút gọn nên không ghi tên khách; đổi ở CRM → Cài đặt → Thông báo Telegram.";

/**
 * Một mục trong danh sách: dòng chính, cộng dòng phụ theo mức người hỏi chọn. Chi tiết thêm một dòng (dòng quan
 * trọng nhất), Đầy đủ thêm hết. Dòng phụ rỗng bị bỏ. Không dòng nào có số điện thoại, địa chỉ chi tiết hay nội dung
 * tin của khách (CLAUDE.md mục 5, 12).
 */
export function block(
  level: NotifyLevel,
  main: string,
  extra: (string | false | null | undefined)[],
): string {
  const lines = extra.filter((x): x is string => Boolean(x));
  const keep = level === "full" ? lines : level === "detail" ? lines.slice(0, 1) : [];
  return [main, ...keep.map((l) => `   ${cap(l)}`)].join("\n");
}

const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/**
 * Ghép đầu tin và các mục, dừng trước giới hạn độ dài của Telegram. Trả số mục đã ghi để nút bấm khớp đúng mục.
 * Mục nhiều dòng thì cách nhau một dòng trống cho dễ đọc trên điện thoại.
 */
export function pack(
  head: string,
  blocks: string[],
  total: number,
  level: NotifyLevel,
): { text: string; shown: number } {
  const tail = level === "short" ? SHORT_NOTE : "";
  const sep = blocks.some((b) => b.includes("\n")) ? "\n\n" : "\n";
  let text = head;
  let shown = 0;
  for (const b of blocks) {
    if (text.length + sep.length + b.length + tail.length + 60 > MAX_TEXT) break;
    text += `${sep}${b}`;
    shown++;
  }
  const rest = total - shown;
  return { text: `${text}${rest > 0 ? `\n\n… còn ${rest} nữa, mở CRM để xem hết.` : ""}${tail}`, shown };
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
// Tóm tắt lead cho mức Chi tiết, Đầy đủ: nhu cầu, liên hệ, thông tin còn thiếu, khung gọi, báo giá. Đọc gộp một lần
// cho cả danh sách (không đọc từng lead).
// ---------------------------------------------------------------------------

interface LeadFacts {
  needs: string | null;
  missing: string[];
  attempts: number;
  lastTouch: string | null;
  nextCallback: string | null;
  window: string | null;
  quote: string | null;
}

const QUOTE_STATUS: Record<string, string> = {
  draft: "nháp",
  sent: "đã gửi",
  viewed: "khách đã xem",
  accepted: "khách đồng ý",
  expired: "hết hạn",
  rejected: "khách từ chối",
};

async function leadFacts(db: Db, showroomId: string, ids: string[]): Promise<Map<string, LeadFacts>> {
  const out = new Map<string, LeadFacts>();
  if (!ids.length) return out;
  const [{ data: leads }, { data: touches }, { data: callbacks }, { data: markets }, { data: quotes }] =
    await Promise.all([
      db
        .from("leads")
        // prettier-ignore
        .select(
          "id, recipient_contact_id, recipient_province, keep_surprise, occasion_date, occasions(label), budget_ranges(label), contacts!leads_contact_id_fkey(country_of_residence)",
        )
        .in("id", ids),
      // Lần liên hệ của nhân viên: cuộc gọi, tin Zalo, tin Messenger do người gửi (không tính tin AI).
      db
        .from("events")
        .select("lead_id, occurred_at")
        .in("lead_id", ids)
        .in("type", ["call", "zalo_out", "messenger_out"])
        .eq("actor_type", "user")
        .order("occurred_at", { ascending: false })
        .limit(2000),
      db
        .from("tasks")
        .select("lead_id, due_at")
        .in("lead_id", ids)
        .eq("type", "callback")
        .eq("status", "open")
        .order("due_at")
        .limit(500),
      db.from("markets").select("country_code, name, call_windows").eq("showroom_id", showroomId),
      db
        .from("quotes")
        .select("lead_id, code, total, status, created_at")
        .in("lead_id", ids)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  const touch = new Map<string, { n: number; last: string }>();
  for (const e of touches ?? []) {
    if (!e.lead_id) continue;
    const t = touch.get(e.lead_id);
    if (t) t.n++;
    else touch.set(e.lead_id, { n: 1, last: e.occurred_at });
  }
  const nextCb = new Map<string, string>();
  for (const t of callbacks ?? []) if (t.lead_id && !nextCb.has(t.lead_id)) nextCb.set(t.lead_id, t.due_at);
  const quoteOf = new Map<string, { code: string; total: number; status: string }>();
  for (const q of quotes ?? []) if (!quoteOf.has(q.lead_id)) quoteOf.set(q.lead_id, q);
  const marketOf = new Map((markets ?? []).map((m) => [m.country_code, m]));

  for (const l of leads ?? []) {
    const occasion = one(l.occasions)?.label;
    const budget = one(l.budget_ranges)?.label;
    const country = one(l.contacts)?.country_of_residence;
    const market = country && country !== "VN" ? marketOf.get(country) : undefined;
    const needs = [
      budget && `Ngân sách ${budget}`,
      occasion &&
        `${occasion}${l.occasion_date ? ` ${l.occasion_date.slice(8, 10)}/${l.occasion_date.slice(5, 7)}` : ""}`,
      l.recipient_province && `nhận ở ${l.recipient_province}`,
      l.keep_surprise && "giữ bất ngờ",
    ].filter((x): x is string => Boolean(x));
    const q = quoteOf.get(l.id);
    const t = touch.get(l.id);
    out.set(l.id, {
      needs: needs.length ? needs.join(" · ") : null,
      // Bốn thông tin bắt buộc ở cuộc gọi đầu (CLAUDE.md mục 6).
      missing: [
        l.recipient_contact_id ? null : "mua cho ai",
        l.recipient_province ? null : "tỉnh người nhận",
        occasion ? null : "dịp mua",
        budget ? null : "ngân sách",
      ].filter((x): x is string => Boolean(x)),
      attempts: t?.n ?? 0,
      lastTouch: t?.last ?? null,
      nextCallback: nextCb.get(l.id) ?? null,
      window: market ? (windowText(market.name, market.call_windows) ?? null) : null,
      quote: q ? `Báo giá ${q.code}: ${formatMoney(q.total)} (${QUOTE_STATUS[q.status] ?? q.status})` : null,
    });
  }
  return out;
}

/** Các dòng phụ của một lead, quan trọng nhất trước (mức Chi tiết chỉ lấy dòng đầu). */
function leadLines(f: LeadFacts | undefined, now: Date): string[] {
  if (!f) return [];
  const contact =
    f.attempts === 0
      ? "Chưa liên hệ lần nào"
      : `Đã liên hệ ${f.attempts} lần, lần cuối ${when(f.lastTouch!, now)}`;
  return [
    f.needs ?? "Chưa hỏi được nhu cầu",
    `${contact}${f.nextCallback ? ` · hẹn gọi lại ${when(f.nextCallback, now)}${f.nextCallback < now.toISOString() ? " (đã qua giờ hẹn)" : ""}` : ""}`,
    f.missing.length ? `Còn thiếu: ${f.missing.join(", ")}` : "",
    f.window ? `Gọi tốt: ${f.window}` : "",
    f.quote ?? "",
  ].filter(Boolean);
}

// ---------------------------------------------------------------------------
// /viec — toàn bộ việc trong ngày của người hỏi (quá hạn và hạn hôm nay)
// ---------------------------------------------------------------------------

async function viec(db: Db, v: Viewer, now: Date, base: string | null): Promise<CommandReply> {
  const start = vnDayStart(now).toISOString();
  const end = vnDayStart(now, 1).toISOString();
  const [{ data: open }, { count: done }] = await Promise.all([
    db
      .from("tasks")
      // prettier-ignore
      .select(
        "id, type, title, due_at, lead_id, order_id, leads(stage, source, contacts!leads_contact_id_fkey(full_name, country_of_residence)), contacts(full_name, country_of_residence)",
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
  const nowIso = now.toISOString();
  const overdue = tasks.filter((t) => t.due_at < nowIso).length;
  const head = `Việc hôm nay ${ddmm(nowIso)} · ${tasks.length} việc${overdue ? ` (${overdue} quá hạn)` : ""}${done ? ` · đã xong ${done}` : ""}`;
  if (!tasks.length)
    return {
      text: `Việc hôm nay ${ddmm(nowIso)}${done ? ` · đã xong ${done}` : ""}\nAnh chị không còn việc nào trong hôm nay.`,
      keyboard: base ? [[{ text: "Mở Việc cần làm", url: `${base}/tasks` }]] : [],
    };

  const list = tasks.slice(0, LIMIT);
  // Tóm tắt lead chỉ đọc ở mức Đầy đủ (mức Chi tiết chỉ cần giai đoạn lead, đã có sẵn).
  const orderIds = [...new Set(list.map((t) => t.order_id).filter((x): x is string => Boolean(x)))];
  const [facts, { data: orders }] = await Promise.all([
    v.level === "full"
      ? leadFacts(db, v.showroomId, [
          ...new Set(list.map((t) => t.lead_id).filter((x): x is string => Boolean(x))),
        ])
      : Promise.resolve(new Map<string, LeadFacts>()),
    v.level !== "short" && orderIds.length
      ? db.from("orders").select("id, code, status, balance_due").in("id", orderIds)
      : Promise.resolve({
          data: [] as { id: string; code: string; status: string; balance_due: number | null }[],
        }),
  ]);
  const orderOf = new Map((orders ?? []).map((o) => [o.id, o]));
  const blocks = list.map((t, i) => {
    const l = one(t.leads);
    const o = t.order_id ? orderOf.get(t.order_id) : undefined;
    const name = nameFor(v, one(t.contacts) ?? one(l?.contacts ?? null));
    const label = TASK_TYPE_LABEL[t.type] ?? "Việc";
    const late = t.due_at < nowIso ? ` (quá hạn ${span(now.getTime() - Date.parse(t.due_at))})` : "";
    const main = `${i + 1}. ${t.due_at < start ? ddmm(t.due_at) : hhmm(t.due_at)} ${label}${name ? ` · ${name}` : ""}${late}`;
    const context = l
      ? `Lead: ${LEAD_STAGE_LABEL[l.stage] ?? l.stage} · ${leadSourceLabel(l.source)}`
      : o
        ? `Đơn ${o.code} · ${ORDER_STATUS_LIVE[o.status]?.label ?? o.status}${(o.balance_due ?? 0) > 0 ? ` · còn thu ${formatMoney(o.balance_due ?? 0)}` : ""}`
        : null;
    const title = maskPhonesInText(t.title).trim();
    return block(v.level, main, [
      context,
      title && title !== label ? `Việc: ${title}` : null,
      ...(t.lead_id ? leadLines(facts.get(t.lead_id), now).slice(0, 3) : []),
    ]);
  });
  const { text, shown } = pack(head, blocks, tasks.length, v.level);
  // Làm nhanh ngay trên Telegram: Xong, Dời 1 giờ cho 5 việc đầu (cùng hàm task_action như trên CRM).
  const quick: InlineButton[][] = tasks.slice(0, Math.min(5, shown)).map((t, i) => [
    { text: `${i + 1}. Xong`, callback_data: `t:done:${t.id}` },
    { text: `${i + 1}. Dời 1 giờ`, callback_data: `t:snz:${t.id}` },
  ]);
  return {
    text,
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
  const nowIso = now.toISOString();
  const late = leads.filter((l) => !l.first_contact_at && l.sla_due_at && l.sla_due_at < nowIso).length;
  // Mức Chi tiết, Đầy đủ có thêm dòng đếm theo giai đoạn để nắm nhanh phễu.
  const byStage = Object.entries(
    leads.reduce<Record<string, number>>((m, l) => ((m[l.stage] = (m[l.stage] ?? 0) + 1), m), {}),
  )
    .map(([s, n]) => `${LEAD_STAGE_LABEL[s] ?? s} ${n}`)
    .join(" · ");
  const head =
    `Lead 3 ngày gần nhất${team ? " của cả showroom" : " của tôi"} · ${leads.length} lead` +
    (leads.length && v.level !== "short" ? `\n${byStage}${late ? ` · quá hạn gọi ${late}` : ""}` : "");
  if (!leads.length) return { text: `${head}\nChưa có lead nào trong 3 ngày qua.`, keyboard: [] };

  const list = leads.slice(0, LIMIT);
  const [holders, facts] = await Promise.all([
    team
      ? staffNames(
          db,
          list.map((l) => l.assigned_to),
        )
      : Promise.resolve(new Map<string, string>()),
    v.level === "short"
      ? Promise.resolve(new Map<string, LeadFacts>())
      : leadFacts(
          db,
          v.showroomId,
          list.map((l) => l.id),
        ),
  ]);
  const blocks = list.map((l, i) => {
    const name = nameFor(v, one(l.contacts));
    const sla =
      !l.first_contact_at && l.sla_due_at
        ? l.sla_due_at < nowIso
          ? ` · quá hạn gọi ${span(now.getTime() - Date.parse(l.sla_due_at))}`
          : ` · gọi trước ${hhmm(l.sla_due_at)}`
        : "";
    const who = team ? ` · ${l.assigned_to ? (holders.get(l.assigned_to) ?? "đã giao") : "chưa giao"}` : "";
    const main = `${i + 1}. ${name ? `${name} · ` : ""}${LEAD_STAGE_LABEL[l.stage] ?? l.stage}${sla} · ${leadSourceLabel(l.source)}${who}`;
    return block(v.level, main, [...leadLines(facts.get(l.id), now), `Vào CRM ${when(l.created_at, now)}`]);
  });
  const { text, shown } = pack(head, blocks, leads.length, v.level);
  return {
    text,
    keyboard: base
      ? linkRows(
          list
            .slice(0, Math.min(9, shown))
            .map((l, i) => ({ text: `Mở lead ${i + 1}`, url: `${base}/leads/${l.id}` })),
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
    // prettier-ignore
    .select(
      "id, code, status, ship_province, seller_id, total, paid_amount, balance_due, is_gift, keep_surprise, recipient:contacts!orders_recipient_contact_id_fkey(full_name, country_of_residence), deliveries(scheduled_on, installed_at)",
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

  const pending = rows.filter((o) => !["installed", "completed"].includes(o.status));
  const lateN = pending.filter((o) => o.sched && o.sched < today).length;
  const todayN = pending.filter((o) => o.sched === today).length;
  const noDate = pending.filter((o) => !o.sched).length;
  const due = pending.reduce((s, o) => s + Math.max(0, o.balance_due ?? 0), 0);
  const summary = [
    todayN && `giao hôm nay ${todayN}`,
    lateN && `trễ hẹn ${lateN}`,
    noDate && `chưa hẹn ngày ${noDate}`,
    due > 0 && `còn phải thu ${formatMoney(due)}`,
  ].filter(Boolean);
  const head =
    `Giao hàng 7 ngày${team ? " của cả showroom" : " đơn của tôi"} · ${rows.length} đơn` +
    (summary.length && v.level !== "short" ? `\n${cap(summary.join(" · "))}` : "");
  if (!rows.length) return { text: `${head}\nKhông có đơn nào cần giao trong 7 ngày tới.`, keyboard: [] };

  const list = rows.slice(0, LIMIT);
  const ids = list.map((o) => o.id);
  const [{ data: items }, sellers] = await Promise.all([
    v.level === "short"
      ? Promise.resolve({ data: [] as { order_id: string; name: string; qty: number; is_gift: boolean }[] })
      : db.from("order_items").select("order_id, name, qty, is_gift").in("order_id", ids).order("created_at"),
    team && v.level === "full"
      ? staffNames(
          db,
          list.map((o) => o.seller_id),
        )
      : Promise.resolve(new Map()),
  ]);
  const itemsOf = new Map<string, string[]>();
  for (const it of items ?? []) {
    const arr = itemsOf.get(it.order_id) ?? [];
    arr.push(`${it.name} ×${it.qty}${it.is_gift ? " (tặng)" : ""}`);
    itemsOf.set(it.order_id, arr);
  }

  const blocks = list.map((o, i) => {
    const name = nameFor(v, one(o.recipient));
    const done = ["installed", "completed"].includes(o.status);
    const date = done
      ? o.installedAt
        ? ` · lắp ${ddmm(o.installedAt)}`
        : ""
      : o.sched
        ? ` · hẹn ${o.sched.slice(8, 10)}/${o.sched.slice(5, 7)}${o.sched < today ? " (trễ hẹn)" : o.sched === today ? " (hôm nay)" : ""}`
        : " · chưa hẹn ngày";
    const main = `${i + 1}. ${o.code}${name ? ` · ${name}` : ""}${o.ship_province ? ` · ${o.ship_province}` : ""} · ${ORDER_STATUS_LIVE[o.status]?.label ?? o.status}${date}`;
    const its = itemsOf.get(o.id) ?? [];
    const flags = [
      o.is_gift && "Đơn quà tặng",
      o.keep_surprise && "giữ bất ngờ, chưa liên hệ người nhận",
      team && o.seller_id && sellers.get(o.seller_id) && `người bán ${sellers.get(o.seller_id)}`,
    ].filter(Boolean);
    return block(v.level, main, [
      its.length ? `${its.slice(0, 4).join(", ")}${its.length > 4 ? ", …" : ""}` : null,
      `Tổng ${formatMoney(o.total)} · ${(o.balance_due ?? 0) > 0 ? `đã thu ${formatMoney(o.paid_amount)}, còn thu ${formatMoney(o.balance_due ?? 0)}` : "đã thu đủ"}`,
      flags.length ? flags.join(" · ").replace(/^./, (c) => c.toUpperCase()) : null,
    ]);
  });
  const { text, shown } = pack(head, blocks, rows.length, v.level);
  return {
    text,
    keyboard: base
      ? linkRows(
          list
            .slice(0, Math.min(8, shown))
            .map((o) => ({ text: `Mở ${o.code}`, url: `${base}/orders/${o.id}` })),
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
  main: string;
  extra: (string | null)[];
  convId: string | null;
  contactId: string | null;
}

/** Còn bao lâu được nhắn khách trên kênh này (Messenger 24 giờ, Zalo miễn phí 48 giờ sau tin cuối của khách). */
export function replyWindow(channel: string, lastInbound: string, now: Date): string | null {
  const left = (h: number) => Date.parse(lastInbound) + h * 3_600_000 - now.getTime();
  if (channel === "messenger") {
    const ms = left(24);
    return ms > 0
      ? `Còn ${span(ms)} để trả lời qua Messenger`
      : "Đã quá 24 giờ: không nhắn Messenger được, gọi điện cho khách";
  }
  if (channel === "zalo") {
    const ms = left(48);
    return ms > 0 ? `Còn ${span(ms)} nhắn Zalo miễn phí` : "Đã quá 48 giờ: tin Zalo sẽ tính phí";
  }
  return null;
}

async function cskh(db: Db, v: Viewer, now: Date, base: string | null): Promise<CommandReply> {
  const since = new Date(now.getTime() - 3 * DAY).toISOString();
  const end = vnDayStart(now, 1).toISOString();
  const nowIso = now.toISOString();
  const seeInbox = v.can("message.view_all") || v.can("message.zalo_send") || v.can("message.messenger_send");
  const items: CareItem[] = [];

  // 1. Khách nhắn trong 3 ngày mà tin cuối vẫn là của khách (chưa ai trả lời), hội thoại chưa đánh dấu xong.
  type Conv = {
    id: string;
    channel: string;
    display_name: string | null;
    last_inbound_at: string | null;
    lead_id: string | null;
    assigned_to: string | null;
    contact_id: string | null;
  };
  let waiting: (Conv & {
    contact: { full_name: string | null; country_of_residence: string | null } | null;
    lead: { assigned_to: string | null; stage: string } | null;
  })[] = [];
  if (seeInbox) {
    const { data: convs } = await db
      .from("conversations")
      // prettier-ignore
      .select(
        "id, channel, display_name, last_inbound_at, lead_id, assigned_to, contact_id, contacts(full_name, country_of_residence), leads(assigned_to, stage)",
      )
      .eq("showroom_id", v.showroomId)
      .neq("status", "done")
      .gte("last_inbound_at", since)
      .order("last_inbound_at", { ascending: false })
      .limit(100);
    // Người không có message.view_all chỉ thấy hội thoại của lead mình giữ, hoặc khách đang hỏi giao cho mình (RLS).
    const mine = (convs ?? [])
      .map((c) => ({ ...c, contact: one(c.contacts), lead: one(c.leads) }))
      .filter((c) =>
        v.can("message.view_all")
          ? true
          : c.lead_id
            ? c.lead?.assigned_to === v.userId
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
      waiting = mine.filter((c) => last.get(c.id) === "in" && c.last_inbound_at);
    }
  }

  // 2. Việc chăm sóc (gọi hỏi thăm sau giao, nhắc thay lõi, bảo hành, dịp tặng, làm nóng lại) tới hạn trong 3 ngày.
  let tq = db
    .from("tasks")
    .select(
      "id, type, title, due_at, assigned_to, contact_id, order_id, contacts(full_name, country_of_residence)",
    )
    .eq("showroom_id", v.showroomId)
    .eq("status", "open")
    .in("type", CARE_TYPES)
    .gte("due_at", since)
    .lt("due_at", end)
    .order("due_at")
    .limit(100);
  if (!v.can("lead.view_all")) tq = tq.eq("assigned_to", v.userId);
  const { data: tasks } = await tq;
  const seen = new Set(waiting.map((c) => c.contact_id ?? c.id));
  const taskItems = (tasks ?? []).filter((t) => !t.contact_id || !seen.has(t.contact_id));

  // Thông tin phụ đọc gộp: hội thoại gần nhất của khách (để nút mở thẳng vào đó), người giữ, vòng đời khách.
  const contactIds = [
    ...new Set(
      [...waiting.map((c) => c.contact_id), ...taskItems.map((t) => t.contact_id)].filter((x): x is string =>
        Boolean(x),
      ),
    ),
  ];
  const deep = v.level !== "short";
  const careOrderIds = [...new Set(taskItems.map((t) => t.order_id).filter((x): x is string => Boolean(x)))];
  const [convRows, people, lifeRows, careOrders] = await Promise.all([
    taskItems.some((t) => t.contact_id) && seeInbox
      ? db
          .from("conversations")
          .select("id, contact_id, last_message_at")
          .in("contact_id", contactIds)
          .order("last_message_at", { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] as { id: string; contact_id: string | null }[] }),
    deep
      ? staffNames(db, [
          ...waiting.map((c) => c.lead?.assigned_to ?? c.assigned_to),
          ...taskItems.map((t) => t.assigned_to),
        ])
      : Promise.resolve(new Map<string, string>()),
    v.level === "full" && contactIds.length
      ? db
          .from("customer_lifecycle")
          .select("contact_id, stage, orders_count, total_paid, owned_products")
          .in("contact_id", contactIds)
      : Promise.resolve({
          data: [] as {
            contact_id: string;
            stage: string;
            orders_count: number;
            total_paid: number;
            owned_products: unknown;
          }[],
        }),
    deep && careOrderIds.length
      ? db.from("orders").select("id, code").in("id", careOrderIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[] }),
  ]);
  const orderCode = new Map((careOrders.data ?? []).map((o) => [o.id, o.code]));
  const convOf = new Map<string, string>();
  for (const c of convRows.data ?? [])
    if (c.contact_id && !convOf.has(c.contact_id)) convOf.set(c.contact_id, c.id);
  const lifeOf = new Map((lifeRows.data ?? []).map((r) => [r.contact_id, r]));

  /** Khách đã mua gì (phiếu bảo hành, món của đơn hoàn tất) và vòng đời, cho mức Đầy đủ. */
  const lifeLines = (contactId: string | null): string[] => {
    const r = contactId ? lifeOf.get(contactId) : undefined;
    if (!r) return [];
    const owned = (Array.isArray(r.owned_products) ? r.owned_products : []) as {
      name?: string;
      warranty_ends?: string | null;
    }[];
    const list = owned
      .filter((p) => p?.name)
      .slice(0, 3)
      .map(
        (p) =>
          `${p.name}${p.warranty_ends ? ` (bảo hành đến ${p.warranty_ends.slice(8, 10)}/${p.warranty_ends.slice(5, 7)}/${p.warranty_ends.slice(0, 4)})` : ""}`,
      );
    const stage = LIFECYCLE_LABEL[r.stage as LifecycleStage]?.label ?? r.stage;
    return [
      `Khách: ${stage}${r.orders_count ? ` · ${r.orders_count} đơn · đã trả ${formatMoney(r.total_paid)}` : ""}`,
      list.length ? `Đang dùng: ${list.join(", ")}` : "",
    ].filter(Boolean);
  };

  for (const c of waiting) {
    const contact = c.contact ?? { full_name: c.display_name, country_of_residence: null };
    const name = nameFor(v, contact);
    const holderId = c.lead?.assigned_to ?? c.assigned_to;
    const holder = holderId ? people.get(holderId) : null;
    const at = c.last_inbound_at!;
    items.push({
      key: c.contact_id ?? c.id,
      at,
      main: `${name ? `${name} · ` : ""}${CHANNEL[c.channel] ?? c.channel} · khách nhắn ${when(at, now)} (chờ ${span(now.getTime() - Date.parse(at))}), chưa trả lời`,
      extra: [
        replyWindow(c.channel, at, now),
        c.lead
          ? `Lead: ${LEAD_STAGE_LABEL[c.lead.stage] ?? c.lead.stage}${holder ? ` · ${holder} giữ` : ""}`
          : `Khách đang hỏi${holder ? ` · ${holder} trả lời` : " · chưa giao ai"}`,
        ...lifeLines(c.contact_id),
      ],
      convId: c.id,
      contactId: c.contact_id,
    });
  }
  for (const t of taskItems) {
    const name = nameFor(v, one(t.contacts));
    const holder = t.assigned_to ? people.get(t.assigned_to) : null;
    const order = t.order_id ? orderCode.get(t.order_id) : undefined;
    const label = TASK_TYPE_LABEL[t.type] ?? "Chăm sóc";
    const title = maskPhonesInText(t.title).trim();
    items.push({
      key: t.contact_id ?? t.id,
      at: t.due_at,
      main: `${name ? `${name} · ` : ""}${label} · hạn ${ddmm(t.due_at)}${t.due_at < nowIso ? ` (quá hạn ${span(now.getTime() - Date.parse(t.due_at))})` : ""}`,
      extra: [
        [
          title && title !== label ? title : null,
          order ? `đơn ${order}` : null,
          holder ? `giao cho ${holder}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
        ...lifeLines(t.contact_id),
      ],
      convId: t.contact_id ? (convOf.get(t.contact_id) ?? null) : null,
      contactId: t.contact_id,
    });
  }

  const head = `Khách cần chăm sóc · 3 ngày gần nhất · ${items.length} khách`;
  if (!items.length)
    return { text: `${head}\nKhông có khách nào cần chăm sóc trong 3 ngày gần nhất.`, keyboard: [] };
  const list = items.slice(0, LIMIT);
  const blocks = list.map((it, i) => block(v.level, `${i + 1}. ${it.main}`, it.extra));
  const { text, shown } = pack(head, blocks, items.length, v.level);
  const buttons = list
    .slice(0, Math.min(9, shown))
    .map((it, i) =>
      it.convId
        ? { text: `Hội thoại ${i + 1}`, url: `${base}/inbox?c=${it.convId}` }
        : it.contactId
          ? { text: `Hồ sơ ${i + 1}`, url: `${base}/customers/${it.contactId}` }
          : null,
    )
    .filter((b): b is { text: string; url: string } => b !== null);
  return { text, keyboard: base ? linkRows(buttons) : [] };
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
