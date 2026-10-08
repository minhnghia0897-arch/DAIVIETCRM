import { formatDue } from "@/lib/tasks/view";

import { LEAD_STAGE_LABEL, leadSourceLabel } from "./labels";

// Dòng hoạt động của hồ sơ lead đọc từ view activities (bảng events, CLAUDE.md mục 4). Hàm thuần đổi một sự kiện
// thành một dòng tiếng Việt; tên người được truyền vào vì payload chỉ giữ mã người dùng.

export const TASK_TYPE_LABEL: Record<string, string> = {
  first_contact: "Liên hệ đầu tiên",
  callback: "Hẹn gọi lại",
  post_delivery_call: "Gọi hỏi thăm sau giao",
  consumable_reminder: "Nhắc thay lõi",
  occasion_reminder: "Nhắc dịp tặng",
  reactivation: "Làm nóng lại",
  delivery_step: "Bước giao lắp",
  warranty_followup: "Theo dõi bảo hành",
  data_fix: "Sửa dữ liệu",
};

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
    case "messenger_in":
      return { kind, text: "Khách nhắn tin qua Messenger" };
    case "messenger_out":
      return {
        kind,
        text:
          payload.via === "page"
            ? "Trả lời khách trên Page Facebook"
            : `Trả lời khách qua Messenger${payload.tag === "HUMAN_AGENT" ? " (trả lời tay ngoài 24 giờ)" : ""}`,
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
