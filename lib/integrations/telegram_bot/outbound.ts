import type { SupabaseClient } from "@supabase/supabase-js";

import {
  defaultPrefs,
  formatNotify,
  inQuietHours,
  type NotifyFacts,
  type NotifyPrefs,
} from "../../notify/events.ts";
import type { Database } from "../../db/types.ts";
import { leadSourceLabel } from "../../leads/labels.ts";
import { integrations } from "../registry.ts";
import { TelegramError, type InlineButton, type TelegramApi } from "./api.ts";

// CRM → Telegram: chọn đúng người nhận, viết tin theo mức chi tiết người đó chọn (lib/notify/events.ts), gửi, rồi ghi
// lại tin nào gắn với lead hay việc nào để tin trả lời về sau ghi đúng hồ sơ. Không bao giờ có số điện thoại hay nội
// dung tin nhắn của khách trong tin (CLAUDE.md mục 5, 12).

type Db = SupabaseClient<Database>;

/**
 * Lỗi cho biết không gửi vào chat này được nữa: người dùng chặn bot, bot bị đưa ra khỏi nhóm, nhóm không còn,
 * hoặc chat_id đã đổi. Gặp lỗi này thì thôi hẳn chat đó thay vì thử lại mỗi phút.
 */
export function isChatGone(e: unknown): boolean {
  if (!(e instanceof TelegramError)) return false;
  if (e.code === 403) return true;
  return e.code === 400 && /chat not found|chat_id is empty|group chat was upgraded/i.test(e.message);
}

/**
 * Gửi một tin, hỏng thì ghi lại và đi tiếp. Một người chặn bot hay một nhóm hỏng không được làm chết cả vòng
 * quét, vì như vậy mọi người ngừng nhận mọi thông báo. Lỗi database vẫn nổi lên vì đó là hỏng thật.
 */
async function trySend(what: string, send: () => Promise<unknown>): Promise<void> {
  try {
    await send();
  } catch (e) {
    if (e instanceof TelegramError) console.error(`Không gửi được ${what}: ${e.message}`);
    else throw e;
  }
}

export const vnTime = (iso: string | Date) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

/** Nút dưới tin: chỉ thao tác nhanh. "Mở CRM" cần địa chỉ HTTPS thật, chưa có trong đợt chạy thử. */
export function keyboardFor(facts: NotifyFacts, level: NotifyPrefs["level"]): InlineButton[][] {
  const { buttons } = formatNotify(facts, level);
  const row = buttons.flatMap<InlineButton>((b) =>
    b.kind === "task_done"
      ? [{ text: b.label, callback_data: `t:done:${b.taskId}` }]
      : b.kind === "task_snooze"
        ? [{ text: b.label, callback_data: `t:snz:${b.taskId}` }]
        : [],
  );
  return row.length ? [row] : [];
}

async function prefsOf(db: Db, userId: string): Promise<NotifyPrefs> {
  const { data } = await db.from("notification_prefs").select("*").eq("user_id", userId).maybeSingle();
  const base = defaultPrefs();
  if (!data) return { ...base, linked: true };
  return {
    linked: true,
    level: data.level as NotifyPrefs["level"],
    events: { ...base.events, ...((data.events as Record<string, boolean>) ?? {}) },
    quiet: {
      on: data.quiet_on,
      from: data.quiet_from?.slice(0, 5) ?? base.quiet.from,
      to: data.quiet_to?.slice(0, 5) ?? base.quiet.to,
    },
  };
}

/**
 * Khung gọi tốt của một thị trường, viết thành một dòng đọc là hiểu:
 * "T2–T6 19:00–22:30 · cuối tuần 09:00–22:30 (giờ Hàn Quốc)".
 * Ngày trong tuần theo quy ước của bảng markets: 1 = Thứ Hai … 7 = Chủ nhật.
 */
function windowText(name: string | null, raw: unknown): string | undefined {
  if (!Array.isArray(raw) || !name) return undefined;
  const parts: string[] = [];
  for (const w of raw as { start?: string; end?: string; days?: number[] }[]) {
    if (!w?.start || !w?.end) continue;
    const days = Array.isArray(w.days) ? w.days : [];
    const weekendOnly = days.length > 0 && days.every((d) => d >= 6);
    const everyDay = days.length >= 7;
    const when = everyDay ? "" : weekendOnly ? "cuối tuần " : days.length ? "T2–T6 " : "";
    parts.push(`${when}${w.start}–${w.end}`);
  }
  return parts.length ? `${parts.join(" · ")} (giờ ${name})` : undefined;
}

/**
 * Tóm tắt một lead cho mức tin "Đầy đủ". Đọc thêm vài bảng danh mục; chỉ gọi khi người nhận chọn mức này,
 * để mức Rút gọn và Chi tiết không phải trả giá truy vấn.
 */
export async function leadSummary(db: Db, leadId: string): Promise<Partial<NotifyFacts>> {
  const { data: lead } = await db
    .from("leads")
    // Chuỗi select phải là một hằng liền mạch thì Supabase mới suy được kiểu trả về.
    // prettier-ignore
    .select(
      "source, recipient_province, recipient_contact_id, keep_surprise, occasion_date, occasions(label), budget_ranges(label), contacts!leads_contact_id_fkey(country_of_residence)",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return {};

  const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const occasion = one(lead.occasions)?.label;
  const budget = one(lead.budget_ranges)?.label;
  const country = one(lead.contacts)?.country_of_residence;

  const { data: market } = country
    ? await db.from("markets").select("name, call_windows").eq("country_code", country).maybeSingle()
    : { data: null };

  const { count } = await db
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .in("type", ["call", "zalo_out"]);

  // Bốn thông tin bắt buộc ở cuộc gọi đầu (CLAUDE.md mục 6).
  const missing = [
    lead.recipient_contact_id ? null : "mua cho ai",
    lead.recipient_province ? null : "tỉnh người nhận",
    occasion ? null : "dịp mua",
    budget ? null : "ngân sách",
  ].filter((x): x is string => Boolean(x));

  return {
    source: leadSourceLabel(lead.source),
    budget: budget ?? undefined,
    occasion: occasion
      ? `${occasion}${lead.occasion_date ? ` · ${lead.occasion_date.slice(8, 10)}/${lead.occasion_date.slice(5, 7)}` : ""}`
      : undefined,
    recipientProvince: lead.recipient_province ?? undefined,
    keepSurprise: lead.keep_surprise ?? false,
    attempts: count ?? 0,
    callWindow: windowText(market?.name ?? null, market?.call_windows),
    missing,
  };
}

/** Gửi một tin riêng cho một người trong CRM (nếu họ đã liên kết và bật loại tin này). Trả true khi đã gửi. */
export async function notifyUser(
  db: Db,
  api: TelegramApi,
  userId: string,
  facts: Omit<NotifyFacts, "to" | "at">,
  ref: { leadId?: string | null; taskId?: string | null } = {},
): Promise<boolean> {
  const { data: link } = await db
    .from("telegram_links")
    .select("chat_id, showroom_id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (!link) return false;
  const prefs = await prefsOf(db, userId);
  if (prefs.events[facts.event] === false) return false;

  const now = vnTime(new Date());
  const extra =
    prefs.level === "full" && ref.leadId ? await leadSummary(db, ref.leadId) : ({} as Partial<NotifyFacts>);
  const full: NotifyFacts = { ...facts, ...extra, to: userId, at: now };
  const { text } = formatNotify(full, prefs.level);
  const keyboard = keyboardFor(full, prefs.level);
  let sent: { message_id: number };
  try {
    sent = await api.call<{ message_id: number }>("sendMessage", {
      chat_id: link.chat_id,
      text,
      disable_notification: inQuietHours(prefs.quiet, now),
      ...(keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  } catch (e) {
    // Người này đã chặn bot hoặc chat không còn: thu hồi liên kết để thôi gửi, họ liên kết lại khi cần.
    if (isChatGone(e)) {
      await db
        .from("telegram_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("revoked_at", null);
      return false;
    }
    throw e;
  }
  await db.from("telegram_messages").insert({
    showroom_id: link.showroom_id,
    chat_id: link.chat_id,
    message_id: sent.message_id,
    user_id: userId,
    lead_id: ref.leadId ?? null,
    task_id: ref.taskId ?? null,
    event_type: facts.event,
  });
  return true;
}

/**
 * Đăng tin rút gọn vào nhóm đang giữ một công dụng (nếu Owner đã gán).
 * Ghi lại tin đã đăng để màn Nhóm nội bộ cho thấy CRM đã nói gì vào nhóm; bot không đọc trò chuyện của đội.
 */
export async function postToGroup(
  db: Db,
  api: TelegramApi,
  showroomId: string,
  purpose: "general" | "delivery" | "care" | "announce",
  text: string,
  ref: { eventType: string; leadId?: string | null; orderId?: string | null } = {
    eventType: "group_post",
  },
): Promise<boolean> {
  const { data: group } = await db
    .from("telegram_groups")
    .select("chat_id")
    .eq("showroom_id", showroomId)
    .eq("purpose", purpose)
    .eq("status", "active")
    .maybeSingle();
  if (!group) return false;
  let sent: { message_id: number };
  try {
    sent = await api.call<{ message_id: number }>("sendMessage", { chat_id: group.chat_id, text });
  } catch (e) {
    // Bot đã bị đưa ra khỏi nhóm hoặc nhóm không còn: đánh dấu để màn Nhóm nội bộ thấy và thôi gửi vào đây.
    if (isChatGone(e)) {
      await db.from("telegram_groups").update({ status: "lost" }).eq("chat_id", group.chat_id);
      return false;
    }
    throw e;
  }
  await db.from("telegram_messages").insert({
    showroom_id: showroomId,
    chat_id: group.chat_id,
    message_id: sent.message_id,
    lead_id: ref.leadId ?? null,
    event_type: ref.eventType,
  });
  return true;
}

// ---------------------------------------------------------------------------
// Quét dữ liệu mới để báo (bản chạy thử dùng vòng quét; bản thật dùng jobs + Edge Function)
// ---------------------------------------------------------------------------

export interface OutboundCursor {
  lastEventId: number;
  lastTaskCheck: string;
  lastApprovalAt: string;
  lastDecisionAt: string;
  lastIntegrationErrorAt: string;
}

const APPROVAL_PERM: Record<string, string> = {
  discount: "order.discount_approve",
  payment_confirm: "payment.confirm",
  stock_count: "inventory.count_approve",
  ai_proposal: "order.discount_approve",
};
const APPROVAL_WHAT: Record<string, string> = {
  discount: "Giảm giá",
  payment_confirm: "Xác nhận tiền",
  stock_count: "Kiểm kê",
  ai_proposal: "Đề xuất AI",
};

/** Người đang hoạt động trong showroom có một quyền, hỏi database một lần cho mỗi showroom và quyền. */
async function usersWithPerm(
  db: Db,
  showroomId: string,
  perm: string,
  cache: Map<string, string[]>,
): Promise<string[]> {
  const key = `${showroomId}:${perm}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { data: people } = await db
    .from("profiles")
    .select("id")
    .eq("showroom_id", showroomId)
    .eq("is_active", true);
  const out: string[] = [];
  for (const p of people ?? []) {
    const { data: allowed } = await db.rpc("has_perm_for", { uid: p.id, perm });
    if (allowed) out.push(p.id);
  }
  cache.set(key, out);
  return out;
}

export async function initialCursor(db: Db): Promise<OutboundCursor> {
  const { data } = await db.from("events").select("id").order("id", { ascending: false }).limit(1);
  const now = new Date().toISOString();
  return {
    lastEventId: data?.[0]?.id ?? 0,
    lastTaskCheck: now,
    lastApprovalAt: now,
    lastDecisionAt: now,
    lastIntegrationErrorAt: now,
  };
}

export async function pollOutbound(db: Db, api: TelegramApi, cur: OutboundCursor): Promise<OutboundCursor> {
  const next = { ...cur };
  // Danh sách người theo quyền dùng lại trong cả vòng quét, tránh hỏi database lặp.
  const permCache = new Map<string, string[]>();

  // Con trỏ cao hơn sự kiện mới nhất nghĩa là dãy id đã lùi (khôi phục từ bản sao lưu, dựng lại database).
  // Không hạ xuống thì mọi sự kiện sau đó bị bỏ qua vĩnh viễn mà không ai biết.
  const { data: newest } = await db
    .from("events")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const maxEventId = newest?.id ?? 0;
  if (next.lastEventId > maxEventId) {
    console.warn(`Con trỏ sự kiện (${next.lastEventId}) cao hơn thực tế (${maxEventId}), hạ về đúng mốc.`);
    next.lastEventId = maxEventId;
  }

  // 1. Lead được giao, lead mới.
  const { data: events } = await db
    .from("events")
    .select("id, type, showroom_id, lead_id, payload")
    .gt("id", next.lastEventId)
    .in("type", ["assignment", "lead_created"])
    .order("id")
    .limit(100);
  for (const e of events ?? []) {
    next.lastEventId = Math.max(next.lastEventId, e.id);
    if (!e.lead_id) continue;
    const { data: lead } = await db
      .from("leads")
      .select("id, sla_due_at, source, contacts!leads_contact_id_fkey(full_name, country_of_residence)")
      .eq("id", e.lead_id)
      .maybeSingle();
    if (!lead) continue;
    const contact = Array.isArray(lead.contacts) ? lead.contacts[0] : lead.contacts;
    const payload = (e.payload ?? {}) as { to?: string | null };
    if (e.type === "assignment" && payload.to) {
      const to = payload.to;
      await trySend("tin lead mới", () =>
        notifyUser(
          db,
          api,
          to,
          {
            event: "lead_assigned",
            customer: contact?.full_name,
            market: contact?.country_of_residence,
            due: lead.sla_due_at ? vnTime(lead.sla_due_at) : undefined,
            path: `/leads/${lead.id}`,
          },
          { leadId: lead.id },
        ),
      );
    }
    if (e.type === "lead_created") {
      await trySend("tin lead mới vào nhóm", () =>
        postToGroup(db, api, e.showroom_id, "announce", `Có 1 lead mới (nguồn: ${lead.source}).`, {
          eventType: "lead_created",
          leadId: lead.id,
        }),
      );
    }
  }

  // 2. Hẹn gọi lại tới giờ.
  const now = new Date().toISOString();
  const { data: due } = await db
    .from("tasks")
    .select(
      "id, title, lead_id, assigned_to, due_at, leads(contacts!leads_contact_id_fkey(full_name, country_of_residence))",
    )
    .eq("status", "open")
    .not("assigned_to", "is", null)
    .gt("due_at", cur.lastTaskCheck)
    .lte("due_at", now);
  for (const t of due ?? []) {
    const leadRel = Array.isArray(t.leads) ? t.leads[0] : t.leads;
    const contact = leadRel
      ? Array.isArray(leadRel.contacts)
        ? leadRel.contacts[0]
        : leadRel.contacts
      : null;
    await trySend("tin hẹn gọi lại", () =>
      notifyUser(
        db,
        api,
        t.assigned_to!,
        {
          event: "callback_due",
          customer: contact?.full_name,
          market: contact?.country_of_residence,
          due: vnTime(t.due_at),
          taskId: t.id,
          path: t.lead_id ? `/leads/${t.lead_id}` : "/tasks",
        },
        { leadId: t.lead_id, taskId: t.id },
      ),
    );
  }
  next.lastTaskCheck = now;

  // 3. Việc mới chờ duyệt: báo người có quyền duyệt, trừ người đề xuất.
  const { data: approvals } = await db
    .from("approvals")
    .select("id, type, showroom_id, requested_by, created_at")
    .eq("status", "pending")
    .gt("created_at", cur.lastApprovalAt)
    .order("created_at");
  for (const a of approvals ?? []) {
    next.lastApprovalAt = a.created_at > next.lastApprovalAt ? a.created_at : next.lastApprovalAt;
    const approvers = await usersWithPerm(db, a.showroom_id, APPROVAL_PERM[a.type] ?? "", permCache);
    for (const uid of approvers) {
      // Người đề xuất không tự duyệt được nên không cần báo.
      if (uid === a.requested_by) continue;
      await trySend("tin chờ duyệt", () =>
        notifyUser(db, api, uid, {
          event: "approval_needed",
          what: APPROVAL_WHAT[a.type],
          path: "/approvals",
        }),
      );
    }
  }

  // 4. Lead quá hạn gọi: báo người giữ lead và người điều phối (CLAUDE.md mục 7).
  //    Mỗi lead chỉ báo một lần cho mỗi người; nhận ra qua tin đã gửi, nên không cần mốc thời gian.
  const slaFrom = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data: overdue } = await db
    .from("leads")
    .select(
      "id, showroom_id, sla_due_at, assigned_to, contacts!leads_contact_id_fkey(full_name, country_of_residence)",
    )
    .is("first_contact_at", null)
    .is("deleted_at", null)
    .not("sla_due_at", "is", null)
    .not("stage", "in", "(won,lost)")
    .lte("sla_due_at", now)
    .gte("sla_due_at", slaFrom)
    .limit(200);

  if (overdue?.length) {
    const { data: already } = await db
      .from("telegram_messages")
      .select("lead_id, user_id")
      .eq("event_type", "sla_overdue")
      .in(
        "lead_id",
        overdue.map((l) => l.id),
      );
    const sent = new Set((already ?? []).map((r) => `${r.lead_id}:${r.user_id}`));

    for (const lead of overdue) {
      const contact = Array.isArray(lead.contacts) ? lead.contacts[0] : lead.contacts;
      const watchers = await usersWithPerm(db, lead.showroom_id, "lead.view_all", permCache);
      const targets = new Set(lead.assigned_to ? [lead.assigned_to, ...watchers] : watchers);
      for (const uid of targets) {
        if (sent.has(`${lead.id}:${uid}`)) continue;
        await trySend("tin lead quá hạn", () =>
          notifyUser(
            db,
            api,
            uid,
            {
              event: "sla_overdue",
              customer: contact?.full_name,
              market: contact?.country_of_residence,
              due: lead.sla_due_at ? vnTime(lead.sla_due_at) : undefined,
              path: `/leads/${lead.id}`,
            },
            { leadId: lead.id },
          ),
        );
      }
    }
  }

  // 5. Đề xuất của tôi đã được duyệt hay bị từ chối.
  const { data: decided } = await db
    .from("approvals")
    .select("type, status, requested_by, requested_by_type, decided_at")
    .in("status", ["approved", "rejected"])
    .not("decided_at", "is", null)
    .gt("decided_at", cur.lastDecisionAt)
    .order("decided_at")
    .limit(100);
  for (const a of decided ?? []) {
    if (a.decided_at && a.decided_at > next.lastDecisionAt) next.lastDecisionAt = a.decided_at;
    // Đề xuất do agent AI tạo thì không có người để báo.
    if (!a.requested_by || a.requested_by_type !== "user") continue;
    const requester = a.requested_by;
    await trySend("tin kết quả duyệt", () =>
      notifyUser(db, api, requester, {
        event: "approval_result",
        what: APPROVAL_WHAT[a.type],
        ok: a.status === "approved",
        path: "/approvals",
      }),
    );
  }

  // 6. Đấu nối bị lỗi: báo người kết nối được, để lead không im lặng ngừng chảy vào CRM.
  const { data: broken } = await db
    .from("integrations")
    .select("key, showroom_id, last_error_at")
    .eq("status", "error")
    .not("last_error_at", "is", null)
    .gt("last_error_at", cur.lastIntegrationErrorAt)
    .order("last_error_at")
    .limit(50);
  for (const r of broken ?? []) {
    if (r.last_error_at && r.last_error_at > next.lastIntegrationErrorAt)
      next.lastIntegrationErrorAt = r.last_error_at;
    const owners = await usersWithPerm(db, r.showroom_id, "settings.integrations", permCache);
    const name = integrations.find((d) => d.key === r.key)?.name ?? r.key;
    for (const uid of owners) {
      await trySend("tin đấu nối lỗi", () =>
        notifyUser(db, api, uid, {
          event: "integration_error",
          integration: name,
          path: "/settings/integrations",
        }),
      );
    }
  }

  return next;
}
