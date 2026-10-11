import { maskPhonesInText } from "@/lib/phone";
import type { CrmAction, CrmState } from "./store";

// Chiều ghi ngược từ Telegram vào CRM (CLAUDE.md 10.3 telegram_bot): Telegram là nơi đội làm việc thay nhóm Zalo,
// nhưng mọi thứ gắn với khách hay đơn phải về hồ sơ trong CRM. Nhân viên trả lời (reply) vào tin bot báo về một
// lead hay một đơn thì nội dung thành ghi chú trên hồ sơ; gửi ảnh chuyển khoản kèm số tiền vào tin của một đơn thì
// thành khoản thanh toán chờ xác nhận. Mọi việc đi qua đúng thao tác của màn CRM nên quyền, nhật ký áp như nhau.
// Hàm thuần: lớp kiểm quyền (access.ts) và reducer cùng dùng, nên không lệch nhau.

export interface TgReplyInput {
  who: string;
  /** Tin bot được trả lời (id trong tgOutbox); không có là tin gõ thẳng cho bot. */
  replyTo?: string;
  text: string;
  /** Tên tệp ảnh đính kèm (bản demo không tải ảnh thật). */
  photo?: string;
  /** Số tiền trên ảnh chuyển khoản, nhân viên gõ kèm. */
  amount?: number;
  actorId: string;
}

export interface TgReplyPlan {
  /** Thao tác CRM sẽ chạy (kiểm quyền như khi bấm trên màn CRM). */
  action?: CrmAction;
  /** Bot trả lời lại trong Telegram. */
  bot: string;
}

const fmtVnd = (v: number) => `${new Intl.NumberFormat("vi-VN").format(v)}đ`;

const HELP =
  "Trả lời (reply) vào một tin báo về lead hoặc đơn để lưu ghi chú vào hồ sơ. Gửi ảnh chuyển khoản kèm số tiền vào tin của đơn để ghi khoản chờ xác nhận. Gõ /viec để xem việc hôm nay.";

/** Đích của một tin bot: lead hay đơn, đọc từ đường dẫn nút "Mở" của tin. */
export function tgTarget(path: string): { oppId?: string; orderId?: string } {
  const lead = /[?&]id=([^&]+)/.exec(path);
  if (path.startsWith("/m?tab=lead") && lead) return { oppId: lead[1] };
  const order = /^\/orders\/([^/?#]+)/.exec(path);
  return order ? { orderId: order[1] } : {};
}

export function planTgReply(s: CrmState, a: TgReplyInput): TgReplyPlan {
  const text = maskPhonesInText(a.text.trim());
  if (/^\/(viec|việc)\b/i.test(text)) {
    const open = s.tasks
      .filter((t) => t.status === "open" && t.owner === a.who)
      .sort((x, y) => x.due - y.due);
    return {
      bot: open.length
        ? `Việc hôm nay (${open.length}):\n${open
            .slice(0, 5)
            .map((t) => `• ${t.title}`)
            .join("\n")}${open.length > 5 ? "\n… mở CRM để xem hết" : ""}`
        : "Anh chị không còn việc nào đang mở.",
    };
  }
  const note = a.replyTo ? s.tgOutbox.find((n) => n.id === a.replyTo && n.to === a.who) : undefined;
  if (!note) return { bot: HELP };

  const { oppId, orderId } = tgTarget(note.path);
  const order = orderId ? s.orders.find((o) => o.id === orderId) : undefined;

  if (order && a.photo) {
    if (!a.amount || a.amount <= 0) return { bot: "Gõ kèm số tiền trên ảnh chuyển khoản, ví dụ 10000000." };
    const paid = order.payments.some((p) => p.type !== "refund" && p.status !== "rejected");
    return {
      action: {
        type: "orderPayment",
        orderId: order.id,
        payType: paid ? "balance" : "deposit",
        method: "Chuyển khoản",
        amount: a.amount,
        reference: `Ảnh ${a.photo} gửi qua Telegram`,
        actorId: a.actorId,
        actor: a.who,
      },
      bot: `Đã ghi ${fmtVnd(a.amount)} cho đơn ${order.code}, chờ người có quyền xác nhận tiền về.`,
    };
  }

  const leadId = oppId ?? order?.oppId;
  const lead = leadId ? s.opps.find((o) => o.id === leadId) : undefined;
  if (!lead) {
    return {
      bot: order
        ? `Đơn ${order.code} không gắn hồ sơ lead nên chưa lưu được ghi chú. Mở CRM để ghi trên đơn.`
        : "Tin này không gắn với khách hay đơn nào nên không lưu vào hồ sơ. Bàn việc chung trong nhóm đội.",
    };
  }
  if (!text) return { bot: "Tin trống, chưa lưu gì." };
  return {
    action: {
      type: "addNote",
      oppId: lead.id,
      text: `Qua Telegram${a.photo ? ` (kèm ảnh ${a.photo})` : ""}: ${text}`,
      actor: a.who,
    },
    bot: `Đã lưu ghi chú vào hồ sơ ${lead.name.split(" ").pop()}${order ? ` (đơn ${order.code})` : ""}.`,
  };
}
