import { HANDOFF_LABEL } from "@/lib/ai/labels";
import { CHANNEL_LABEL, PURPOSE_LABEL } from "@/lib/cdp/lifecycle";
import { formatMoney } from "@/lib/format";
import { ORDER_STATUS_LIVE } from "@/lib/sales/order-labels";
import { formatDue } from "@/lib/tasks/view";

import { TASK_TYPE_LABEL } from "../tasks/labels.ts";
import { LEAD_STAGE_LABEL, leadSourceLabel } from "./labels";

// Dòng hoạt động của hồ sơ lead đọc từ view activities (bảng events, CLAUDE.md mục 4). Hàm thuần đổi một sự kiện
// thành một dòng tiếng Việt; tên người được truyền vào vì payload chỉ giữ mã người dùng.

export { TASK_TYPE_LABEL } from "../tasks/labels.ts";

const KIND: Record<string, string> = {
  lead_created: "Lead mới",
  assignment: "Giao lead",
  stage_change: "Giai đoạn",
  call: "Cuộc gọi",
  note: "Ghi chú",
  task_done: "Việc",
  task_missed: "Việc",
  merge: "Chống trùng",
  sla_breached: "Quá hạn gọi",
  messenger_in: "Messenger",
  messenger_out: "Messenger",
  zalo_in: "Zalo",
  zalo_out: "Zalo",
  identity_added: "Định danh",
  lead_qualified: "Lead mới",
  conversation_assignment: "Giao hội thoại",
  lead_reverted: "Khách đang hỏi",
  ai_handoff: "Trợ lý AI",
  ai_takeover: "Trợ lý AI",
  ai_release: "Trợ lý AI",
  consent_changed: "Đồng ý",
  contact_updated: "Thông tin khách",
  contact_renamed: "Thông tin khách",
  address_saved: "Thông tin khách",
  quote_sent: "Báo giá",
  quote_viewed: "Báo giá",
  quote_accepted: "Báo giá",
  order_status_changed: "Đơn hàng",
  payment_recorded: "Thanh toán",
  payment_confirmed: "Thanh toán",
  payment_rejected: "Thanh toán",
  delivery_step: "Giao lắp",
  warranty_created: "Bảo hành",
};

const DELIVERY_STEP: Record<string, string> = {
  stock_issued: "Đã xuất kho, gán serial",
  scheduled: "Đã hẹn lịch giao lắp",
  handover_sent: "Đã gửi bàn giao cho khách",
};

const PAYMENT_TYPE: Record<string, string> = {
  deposit: "tiền cọc",
  balance: "tiền còn lại",
  refund: "hoàn tiền",
};

const MERGE_REASON: Record<string, string> = {
  open_lead: "Khách đã có lead đang mở, ghi vào lead này thay vì tạo lead mới",
  recent_lost_lead: "Khách có lead thất bại chưa quá 30 ngày, ghi vào lead này thay vì tạo lead mới",
  returning_customer: "Khách cũ quay lại, tạo lead mới trên cùng hồ sơ khách",
};

const ASSIGN_REASON: Record<string, string> = {
  user_locked: "người giữ bị khóa tài khoản",
  offboarding: "bàn giao do nghỉ việc",
};

export interface ActivityLine {
  kind: string;
  text: string;
  /** Đường dẫn Storage của ảnh gửi kèm (ghi chú từ Telegram); trang tự ký link xem ngắn hạn. */
  file?: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function describeEvent(
  type: string,
  payload: Record<string, unknown>,
  ctx: { names: ReadonlyMap<string, string>; now: Date },
): ActivityLine {
  const kind = KIND[type] ?? "Sự kiện";
  const who = (id: unknown) => ctx.names.get(str(id)) ?? "người khác";
  switch (type) {
    case "lead_created":
      return {
        kind,
        text: `${payload.attached ? "Khách liên hệ lại" : "Lead vào"} từ ${leadSourceLabel(str(payload.source))}`,
      };
    case "sla_breached": {
      const late = Number(payload.late_minutes) || 0;
      const who = payload.assigned_to
        ? ` (${ctx.names.get(str(payload.assigned_to)) ?? "người khác"} đang giữ)`
        : "";
      return { kind, text: `Chưa gọi khi hết hạn${late ? `, trễ ${late} phút` : ""}${who}` };
    }
    case "lead_qualified":
      return {
        kind,
        text:
          payload.by === "ai"
            ? `Trợ lý AI chuyển khách thành lead (${HANDOFF_LABEL[str(payload.reason)] ?? "khách cần gọi"})`
            : `Chuyển từ hội thoại ${payload.channel === "zalo" ? "Zalo OA" : "Messenger"} thành lead`,
      };
    case "ai_handoff":
      return {
        kind,
        text: `Trợ lý AI chuyển cho nhân viên: ${HANDOFF_LABEL[str(payload.reason)] ?? "AI chưa trả lời được"}`,
      };
    case "ai_takeover":
      return { kind, text: "Nhân viên tiếp quản hội thoại, AI dừng" };
    case "ai_release":
      return { kind, text: "Trả hội thoại lại cho Trợ lý AI" };
    case "conversation_assignment":
      return {
        kind,
        text: payload.to
          ? `Giao hội thoại cho ${who(payload.to)}${payload.reason === "auto" ? " (người đang trực)" : ""}`
          : "Bỏ người phụ trách hội thoại",
      };
    case "lead_reverted":
      return { kind, text: "Lead tự tạo từ tin nhắn được đưa về khách đang hỏi" };
    case "messenger_in":
      return { kind, text: "Khách nhắn tin qua Messenger" };
    case "messenger_out":
      return {
        kind,
        text:
          payload.via === "page"
            ? "Trả lời khách trên Page Facebook"
            : payload.ai_run_id
              ? "Trợ lý AI trả lời khách qua Messenger"
              : `Trả lời khách qua Messenger${payload.tag === "HUMAN_AGENT" ? " (trả lời tay ngoài 24 giờ)" : ""}`,
      };
    case "zalo_in":
      return { kind, text: "Khách nhắn tin qua Zalo OA" };
    case "zalo_out":
      return {
        kind,
        text:
          payload.via === "page"
            ? "Trả lời khách trên ứng dụng Zalo OA"
            : payload.ai_run_id
              ? "Trợ lý AI trả lời khách qua Zalo OA"
              : `Trả lời khách qua Zalo OA${payload.tag === "paid" ? " (tin tính phí ngoài 48 giờ)" : ""}`,
      };
    case "identity_added":
      return {
        kind,
        text:
          payload.type === "phone" ? "Khách chia sẻ số điện thoại qua Zalo OA" : "Thêm định danh liên lạc",
      };
    case "merge":
      return {
        kind,
        text:
          MERGE_REASON[str(payload.reason)] ??
          (payload.matched_by === "fb_psid"
            ? "Gộp theo tài khoản Facebook trùng"
            : "Gộp theo số điện thoại trùng"),
      };
    case "assignment": {
      const reason = ASSIGN_REASON[str(payload.reason)];
      const base = payload.to ? `Giao cho ${who(payload.to)}` : "Trả về hàng Chưa phân";
      return { kind, text: reason ? `${base} (${reason})` : base };
    }
    case "stage_change":
      return {
        kind,
        text: `${LEAD_STAGE_LABEL[str(payload.from)] ?? str(payload.from)} → ${LEAD_STAGE_LABEL[str(payload.to)] ?? str(payload.to)}`,
      };
    case "call": {
      const parts = [`${payload.channel === "zalo" ? "Zalo" : "Điện thoại"}: ${str(payload.outcome_label)}`];
      if (str(payload.note)) parts.push(str(payload.note));
      if (str(payload.callback_at)) parts.push(`Hẹn gọi lại ${formatDue(str(payload.callback_at), ctx.now)}`);
      return { kind, text: parts.join(". ") };
    }
    case "note": {
      const from = payload.channel === "telegram" ? " (gửi từ Telegram)" : "";
      const text = str(payload.text) || (payload.file ? "Ảnh đính kèm" : "");
      return { kind, text: `${text}${from}`, ...(str(payload.file) ? { file: str(payload.file) } : {}) };
    }
    case "consent_changed": {
      const purpose =
        PURPOSE_LABEL[str(payload.purpose) as keyof typeof PURPOSE_LABEL] ?? str(payload.purpose);
      const channel =
        CHANNEL_LABEL[str(payload.channel) as keyof typeof CHANNEL_LABEL] ?? str(payload.channel);
      if (payload.purpose === "care" && payload.channel === "all")
        return {
          kind,
          text: payload.granted ? "Khách cho liên hệ lại" : "Khách yêu cầu ngừng mọi liên hệ",
        };
      return {
        kind,
        text: `${payload.granted ? "Khách đồng ý" : "Khách rút đồng ý"}: ${purpose}, ${channel}`,
      };
    }
    case "contact_updated":
      return { kind, text: "Sửa nơi sống, tỉnh, quan hệ trong hộ" };
    case "contact_renamed":
      return { kind, text: "Đổi tên khách" };
    case "address_saved":
      return { kind, text: "Lưu địa chỉ giao hàng" };
    case "quote_sent":
      return {
        kind,
        text: `Gửi báo giá ${str(payload.code)}${typeof payload.total === "number" ? `, ${formatMoney(payload.total)}` : ""}`,
      };
    case "quote_viewed":
      return { kind, text: `Khách mở báo giá ${str(payload.code)}` };
    case "quote_accepted":
      return { kind, text: `Khách đồng ý báo giá ${str(payload.code)}` };
    case "order_status_changed":
      return {
        kind,
        text: `Đơn ${str(payload.code)}: ${ORDER_STATUS_LIVE[str(payload.to)]?.label ?? str(payload.to)}`,
      };
    case "payment_recorded":
    case "payment_confirmed":
    case "payment_rejected": {
      const verb =
        type === "payment_recorded"
          ? payload.type === "refund"
            ? "Ghi hoàn tiền"
            : "Ghi nhận"
          : type === "payment_confirmed"
            ? "Xác nhận tiền về"
            : "Từ chối khoản";
      const what = payload.type === "refund" ? "" : ` ${PAYMENT_TYPE[str(payload.type)] ?? "thanh toán"}`;
      const amount = typeof payload.amount === "number" ? ` ${formatMoney(payload.amount)}` : "";
      return { kind, text: `${verb}${what}${amount}, đơn ${str(payload.code)}` };
    }
    case "delivery_step":
      return {
        kind,
        text: `Đơn ${str(payload.code)}: ${DELIVERY_STEP[str(payload.step)] ?? "cập nhật bước giao lắp"}`,
      };
    case "warranty_created":
      return { kind, text: `Tạo phiếu bảo hành cho đơn ${str(payload.code)}` };
    case "task_done": {
      const label = TASK_TYPE_LABEL[str(payload.type)] ?? "Việc";
      return { kind, text: `Xong: ${label}${str(payload.outcome) ? ` (${str(payload.outcome)})` : ""}` };
    }
    case "task_missed":
      return { kind, text: `Lỡ hẹn: ${TASK_TYPE_LABEL[str(payload.type)] ?? "Việc"}` };
    default:
      return { kind, text: type };
  }
}
