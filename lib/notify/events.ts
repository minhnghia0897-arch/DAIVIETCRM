// Thông báo đẩy ra điện thoại (Telegram bot): danh mục sự kiện, mặc định, và cách viết tin theo mức chi tiết
// từng nhân viên tự chọn. Hàm thuần, dùng chung cho bản demo và bộ gửi thật sau này.
//
// Nguyên tắc (CLAUDE.md mục 5, 12): tin gửi ra ngoài không bao giờ chứa số điện thoại đầy đủ hay nội dung tin nhắn
// của khách. Mức "Rút gọn" chỉ báo có việc; mức "Chi tiết" thêm tên gọi ngắn của khách, sản phẩm, giờ hẹn.
// Muốn xem đầy đủ thì bấm mở CRM (Mini App), nơi quyền được kiểm như mọi màn khác.

export type NotifyEvent =
  | "lead_assigned"
  | "sla_overdue"
  | "callback_due"
  | "approval_needed"
  | "approval_result"
  | "order_status"
  | "chat_mention"
  | "chat_message"
  | "integration_error";

export type NotifyLevel = "short" | "detail";

export interface NotifyEventDef {
  key: NotifyEvent;
  label: string;
  /** Mô tả một dòng cho trang cài đặt. */
  hint: string;
  /** Quyền cần có để sự kiện hiện trong cài đặt (người không có quyền không bao giờ nhận). */
  anyOf: string[];
  defaultOn: boolean;
}

export const NOTIFY_EVENTS: NotifyEventDef[] = [
  {
    key: "lead_assigned",
    label: "Lead mới giao cho tôi",
    hint: "Báo ngay khi được giao, kèm hạn gọi",
    anyOf: ["lead.view_own", "lead.view_all"],
    defaultOn: true,
  },
  {
    key: "callback_due",
    label: "Đến giờ hẹn gọi lại",
    hint: "Báo đúng giờ hẹn với khách",
    anyOf: ["lead.view_own", "lead.view_all"],
    defaultOn: true,
  },
  {
    key: "sla_overdue",
    label: "Lead quá hạn gọi",
    hint: "Lead của tôi, hoặc của đội nếu tôi điều phối",
    anyOf: ["lead.view_own", "lead.view_all"],
    defaultOn: true,
  },
  {
    key: "approval_needed",
    label: "Có việc chờ tôi duyệt",
    hint: "Giảm giá, xác nhận tiền, kiểm kê",
    anyOf: ["order.discount_approve", "payment.confirm", "inventory.count_approve"],
    defaultOn: true,
  },
  {
    key: "approval_result",
    label: "Đề xuất của tôi được duyệt hoặc từ chối",
    hint: "Giảm giá, khoản thanh toán tôi ghi",
    anyOf: ["quote.create", "payment.record", "order.create"],
    defaultOn: true,
  },
  {
    key: "order_status",
    label: "Đơn của tôi đổi trạng thái",
    hint: "Đã cọc, đang giao, đã lắp, hoàn tất",
    anyOf: ["order.view_own", "order.view_all"],
    defaultOn: true,
  },
  {
    key: "chat_mention",
    label: "Có người nhắc tôi trong nhóm nội bộ",
    hint: "Khi có @tên của tôi",
    anyOf: [],
    defaultOn: true,
  },
  {
    key: "chat_message",
    label: "Mọi tin mới trong nhóm nội bộ",
    hint: "Nhiều tin, mặc định tắt",
    anyOf: [],
    defaultOn: false,
  },
  {
    key: "integration_error",
    label: "Đấu nối bị lỗi",
    hint: "Zalo OA, Form Facebook… ngừng nhận dữ liệu",
    anyOf: ["settings.integrations"],
    defaultOn: true,
  },
];

/**
 * Lọc một bản vá "bật tắt sự kiện" về đúng các sự kiện có thật.
 * Nhận cả bản vá một sự kiện lẫn cả bộ, nên giao diện gửi kiểu nào server cũng hiểu.
 */
export function pickKnownEvents(input: unknown): Partial<Record<NotifyEvent, boolean>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const known = new Set<string>(NOTIFY_EVENTS.map((e) => e.key));
  const out: Partial<Record<NotifyEvent, boolean>> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (known.has(key) && typeof value === "boolean") out[key as NotifyEvent] = value;
  }
  return out;
}

export interface NotifyPrefs {
  /** Đã liên kết Telegram (bấm link mở bot, Start). */
  linked: boolean;
  /** Tên Telegram hiển thị sau khi liên kết. */
  telegram?: string;
  level: NotifyLevel;
  events: Partial<Record<NotifyEvent, boolean>>;
  quiet: { on: boolean; from: string; to: string };
}

export const defaultPrefs = (): NotifyPrefs => ({
  linked: false,
  level: "short",
  events: Object.fromEntries(NOTIFY_EVENTS.map((e) => [e.key, e.defaultOn])),
  quiet: { on: true, from: "22:00", to: "07:00" },
});

/** Sự kiện người này được chọn: chỉ sự kiện họ có quyền liên quan. */
export function eventsFor(perms: ReadonlySet<string>): NotifyEventDef[] {
  return NOTIFY_EVENTS.filter((e) => e.anyOf.length === 0 || e.anyOf.some((p) => perms.has(p)));
}

/** Đang trong giờ im lặng không (giờ dạng "HH:MM", khung có thể qua nửa đêm). */
export function inQuietHours(quiet: NotifyPrefs["quiet"], hhmm: string): boolean {
  if (!quiet.on) return false;
  const { from, to } = quiet;
  return from <= to ? hhmm >= from && hhmm < to : hhmm >= from || hhmm < to;
}

/** Nút dưới tin: mở Mini App ở một màn, hoặc thao tác nhanh không cần mở. */
export type NotifyButton =
  | { kind: "open"; label: string; path: string }
  | { kind: "task_done"; label: string; taskId: string }
  | { kind: "task_snooze"; label: string; taskId: string; minutes: number };

/** Dữ liệu thô của một thông báo (chưa viết thành chữ). */
export interface NotifyFacts {
  event: NotifyEvent;
  /** Tên gọi ngắn người nhận. */
  to: string;
  at: string;
  /** Tên khách đầy đủ trong CRM; chỉ dùng để rút gọn, không gửi nguyên. */
  customer?: string;
  /** "KR" | "VN" để ghi (Hàn) / (VN). */
  market?: string;
  product?: string;
  /** Giờ hạn, giờ hẹn dạng HH:MM. */
  due?: string;
  orderCode?: string;
  status?: string;
  /** Loại việc cần duyệt hoặc kết quả duyệt. */
  what?: string;
  ok?: boolean;
  from?: string;
  group?: string;
  integration?: string;
  path: string;
  taskId?: string;
}

/** Tên gọi ngắn của khách: tên riêng (từ cuối), không họ, không số. */
export function shortCustomer(full?: string, market?: string): string {
  if (!full) return "khách";
  const given = full.trim().split(/\s+/).pop() ?? full;
  return market === "KR" ? `${given} (Hàn)` : given;
}

/** Viết tin theo mức chi tiết. Không bao giờ ghi số điện thoại hay nội dung tin nhắn của khách. */
export function formatNotify(f: NotifyFacts, level: NotifyLevel): { text: string; buttons: NotifyButton[] } {
  const c = shortCustomer(f.customer, f.market);
  const d = level === "detail";
  const open = (label: string): NotifyButton => ({ kind: "open", label, path: f.path });
  switch (f.event) {
    case "lead_assigned":
      return {
        text: d
          ? `Lead mới: ${c}${f.product ? `, ${f.product}` : ""}. Gọi trước ${f.due ?? "hạn SLA"}.`
          : `Anh chị có 1 lead mới, gọi trước ${f.due ?? "hạn SLA"}.`,
        buttons: [open("Mở và gọi")],
      };
    case "callback_due":
      return {
        text: d ? `Đến giờ gọi lại ${c} (${f.due}).` : `Đến giờ hẹn gọi lại (${f.due}).`,
        buttons: [
          open("Mở và gọi"),
          ...(f.taskId
            ? ([
                { kind: "task_done", label: "Xong", taskId: f.taskId },
                { kind: "task_snooze", label: "Hẹn lại 1 giờ", taskId: f.taskId, minutes: 60 },
              ] as NotifyButton[])
            : []),
        ],
      };
    case "sla_overdue":
      return {
        text: d ? `Lead ${c} quá hạn gọi (hạn ${f.due}).` : `Có 1 lead quá hạn gọi.`,
        buttons: [open("Mở lead")],
      };
    case "approval_needed":
      return {
        text: d
          ? `Chờ anh chị duyệt: ${f.what}${f.orderCode ? ` ${f.orderCode}` : ""}.`
          : `Có 1 việc chờ anh chị duyệt.`,
        buttons: [open("Mở để duyệt")],
      };
    case "approval_result":
      return {
        text: d
          ? `${f.what ?? "Đề xuất"}${f.orderCode ? ` ${f.orderCode}` : ""} đã được ${f.ok ? "duyệt" : "từ chối"}.`
          : `Đề xuất của anh chị đã được ${f.ok ? "duyệt" : "từ chối"}.`,
        buttons: [open("Xem")],
      };
    case "order_status":
      return {
        text: d ? `Đơn ${f.orderCode} của ${c}: ${f.status}.` : `Đơn ${f.orderCode}: ${f.status}.`,
        buttons: [open("Xem đơn")],
      };
    case "chat_mention":
      return {
        text: d ? `${f.from} nhắc anh chị trong ${f.group}.` : `Có người nhắc anh chị trong nhóm nội bộ.`,
        buttons: [open("Mở nhóm")],
      };
    case "chat_message":
      return {
        text: d ? `Tin mới trong ${f.group} từ ${f.from}.` : `Có tin mới trong nhóm nội bộ.`,
        buttons: [open("Mở nhóm")],
      };
    case "integration_error":
      return {
        text: `Đấu nối ${f.integration} đang lỗi, lead có thể chưa vào CRM.`,
        buttons: [open("Mở Tích hợp")],
      };
  }
}
