import { HOUSES } from "@/lib/demo/crm-data";
import { missingInfo, newLeadInfo } from "@/lib/demo/ops-data";
import type { CrmAction, CrmState, OrderRec, QueueItem } from "./store";
import { planTgReply } from "./telegram-in";

// Phạm vi xem và kiểm quyền cho mọi thao tác của bản demo, đóng vai server (CLAUDE.md mục 5, nguyên tắc 3):
// giao diện ẩn nút chỉ để dễ dùng, còn thao tác gửi lên vẫn bị kiểm lại ở đây trước khi đổi dữ liệu.
// Bản thật làm việc này bằng RLS, has_perm() và requireWritable() ở server action.

export interface Who {
  perms: ReadonlySet<string>;
  /** Tên gọi ngắn, khớp cột "người phụ trách" của dữ liệu mô phỏng. */
  me: string;
  userId: string;
  isOwner: boolean;
  /** Đang "Xem như người dùng": chỉ đọc, chặn mọi thao tác ghi. */
  readOnly: boolean;
}

const has = (w: Who, p: string) => w.perms.has(p);

/** Cơ hội trong phạm vi xem: mọi lead với `lead.view_all`, lead mình giữ với `lead.view_own`. */
export function visibleOpps(s: CrmState, w: Who) {
  if (has(w, "lead.view_all")) return s.opps;
  if (has(w, "lead.view_own")) return s.opps.filter((o) => o.owner === w.me);
  return [];
}

/** Hộ trong phạm vi xem: hộ có lead mình được xem. */
export function visibleHouses(s: CrmState, w: Who) {
  if (has(w, "lead.view_all")) return HOUSES;
  const opps = visibleOpps(s, w);
  return HOUSES.filter((h) => opps.some((o) => o.houseId === h.id));
}

/** Hội thoại: mọi hội thoại với `message.view_all`, còn lại chỉ hội thoại gắn lead mình được xem. */
export function visibleConvs(s: CrmState, w: Who) {
  if (has(w, "message.view_all")) return s.convs;
  if (!has(w, "message.zalo_send")) return [];
  const houses = new Set(visibleHouses(s, w).map((h) => h.id));
  return s.convs.filter((c) => c.houseId && houses.has(c.houseId));
}

/** Nhóm nội bộ mình là thành viên (Owner cũng chỉ thấy nhóm mình tham gia, như Telegram). */
export function visibleChats(s: CrmState, w: Who) {
  return s.chats.filter((c) => c.members.includes(w.me));
}

/** Hàng chờ duyệt: mục mình có quyền duyệt, cộng các đề xuất của chính mình (để theo dõi). */
export function visibleQueue(s: CrmState, w: Who): QueueItem[] {
  return s.queue.filter((q) => has(w, q.perm) || (q.requestedBy !== undefined && q.requestedBy === w.me));
}

/** Kênh của hội thoại sang đấu nối và quyền gửi; Hotline là cuộc gọi, không trả lời bằng tin. */
export const CHANNEL_SEND: Record<string, { key: string; perm: string } | null> = {
  Zalo: { key: "zalo_oa", perm: "message.zalo_send" },
  Facebook: { key: "meta_messenger", perm: "message.zalo_send" },
  "TikTok Live": { key: "tiktok_messaging", perm: "message.zalo_send" },
  Hotline: null,
};

/** Lý do không trả lời được trên CRM; null là được trả lời. */
export function replyBlocker(s: CrmState, w: Who, channel: string): string | null {
  const ch = CHANNEL_SEND[channel];
  if (!ch) return "Hội thoại tổng đài, không trả lời bằng tin nhắn";
  const mode = s.settings.replyMode[ch.key] ?? "off";
  // Công cụ ngoài duy nhất trong sổ đăng ký là Pancake (CLAUDE.md 10.5).
  if (mode === "external") return "Kênh này đang được trả lời trên Pancake, CRM chỉ đọc";
  if (mode === "off") return "Kênh này đang tắt trong Cài đặt, Tích hợp";
  if (!has(w, ch.perm)) return "Anh chị chưa được cấp quyền gửi tin";
  return null;
}

function leadEditable(s: CrmState, w: Who, oppId: string) {
  const o = s.opps.find((x) => x.id === oppId);
  if (!o) return false;
  return has(w, "lead.edit_all") || (has(w, "lead.edit_own") && o.owner === w.me);
}

function orderMine(o: OrderRec, w: Who) {
  return o.sellerId === w.userId;
}

function orderEditable(o: OrderRec | undefined, w: Who) {
  if (!o) return false;
  return has(w, "order.edit_all") || (has(w, "order.edit_own") && orderMine(o, w));
}

/** Được xem số đầy đủ của người đặt hoặc người nhận thuộc lead (CLAUDE.md mục 5, chế độ gọi). */
export function revealAllowed(s: CrmState, w: Who, oppId: string, who: "buyer" | "recipient"): boolean {
  const o = s.opps.find((x) => x.id === oppId);
  if (!o) return false;
  if (who === "recipient" && s.leadInfo[oppId]?.keepSurprise) return false;
  return has(w, "contact.phone_reveal") || (has(w, "contact.phone_reveal_assigned") && o.owner === w.me);
}

/** Quyền sửa từng phần của Cài đặt (CLAUDE.md 11.2). */
const SETTING_PERM: Record<string, string> = {
  callMode: "settings.integrations",
  replyMode: "settings.integrations",
  prereqs: "settings.integrations",
  connected: "settings.integrations",
  integrationStates: "settings.integrations",
  slaMinutes: "settings.assignment",
  maxUncontacted: "settings.assignment",
  markets: "settings.assignment",
  shifts: "settings.assignment",
  taskRules: "settings.assignment",
  catalogs: "catalog.manage",
  policies: "policy.manage",
  policyArchive: "policy.manage",
};

const NO = "Anh chị chưa được cấp quyền làm việc này";
const NOT_YOURS = "Lead này không do anh chị giữ";

// Thao tác chỉ đổi lựa chọn trên màn hình hoặc do hệ thống tự chạy: không cần quyền, chạy cả khi chỉ đọc.
const VIEW_ONLY = new Set([
  "tick",
  "selectOpp",
  "selectHouse",
  "selectConv",
  "selectTrace",
  "customerFollowUp",
  "chatSeen",
]);

type AnyAction = { type: string } & Record<string, unknown>;

/** Lý do chặn một thao tác; null là được làm. */
export function deniedReason(s: CrmState, action: CrmAction, w: Who): string | null {
  const a = action as AnyAction;
  if (VIEW_ONLY.has(a.type)) return null;
  if (w.readOnly) return "Đang xem như người dùng khác, chỉ đọc";
  const str = (k: string) => String(a[k] ?? "");
  const opp = () => s.opps.find((x) => x.id === str("oppId"));
  const order = () => s.orders.find((x) => x.id === str("orderId"));
  switch (a.type) {
    case "togglePause":
    case "toggleAgent":
      return has(w, "settings.integrations") ? null : NO;
    case "assignOccasion":
      return has(w, "lead.assign") ? null : NO;
    case "decide": {
      const q = s.queue.find((x) => x.id === str("id"));
      return q && has(w, q.perm) ? null : NO;
    }
    case "advanceOpp":
    case "updateLeadInfo":
    case "addNote":
    case "addDate":
    case "logCall":
    case "callOpp":
      return leadEditable(s, w, str("oppId") || str("id")) ? null : NOT_YOURS;
    case "loseOpp":
      if (!has(w, "lead.mark_lost")) return NO;
      if (!str("reason")) return "Cần chọn lý do thất bại";
      return leadEditable(s, w, str("oppId")) ? null : NOT_YOURS;
    case "revealPhone":
      return revealAllowed(s, w, str("oppId"), a.who === "recipient" ? "recipient" : "buyer")
        ? null
        : a.who === "recipient" && s.leadInfo[str("oppId")]?.keepSurprise
          ? "Lead đang Giữ bất ngờ: không hiện số người nhận"
          : "Chỉ người đang giữ lead mới xem được số";
    case "createLead":
      return has(w, "lead.create") ? null : NO;
    case "createCross":
      return has(w, "lead.create") && visibleHouses(s, w).some((h) => h.id === str("houseId")) ? null : NO;
    case "importLeads":
      return has(w, "lead.import") ? null : NO;
    case "assignLead":
      return has(w, "lead.assign") ? null : NO;
    case "toggleDuty":
      // Bật trực cho chính mình theo quyền nhận lead; bật tắt hộ người khác cần quyền quản lý ca.
      return str("name") === w.me
        ? has(w, "lead.receive")
          ? null
          : "Anh chị chưa được bật quyền nhận lead"
        : has(w, "staff.manage") || has(w, "settings.assignment")
          ? null
          : NO;
    case "completeTask":
    case "missTask":
    case "snoozeTask": {
      const t = s.tasks.find((x) => x.id === str("id"));
      if (!t) return NO;
      return t.owner === w.me || (!t.owner && has(w, "lead.view_all")) || has(w, "lead.edit_all")
        ? null
        : "Việc này không giao cho anh chị";
    }
    case "takeOver":
    case "closeConv":
    case "reply": {
      const c = visibleConvs(s, w).find((x) => x.id === s.convSel);
      if (!c) return NO;
      return a.type === "closeConv" ? null : replyBlocker(s, w, c.channel);
    }
    case "sendQuote": {
      const o = opp();
      if (!has(w, "quote.create") || !o) return NO;
      if (!leadEditable(s, w, o.id)) return NOT_YOURS;
      return missingInfo(s.leadInfo[o.id] ?? newLeadInfo("VN")).length
        ? "Chưa đủ 4 thông tin bắt buộc, chưa tạo được báo giá"
        : null;
    }
    case "markQuote": {
      const q = s.quotes.find((x) => x.id === str("id"));
      if (!q || !leadEditable(s, w, q.oppId)) return NOT_YOURS;
      if (q.status === "pending_approval" || q.status === "rejected" || q.status === "accepted")
        return "Báo giá chưa gửi khách hoặc đã đóng";
      return a.status === "accepted" && !has(w, "order.create") ? NO : null;
    }
    case "approve": {
      const q = s.queue.find((x) => x.id === str("id"));
      if (!q || !has(w, q.perm)) return NO;
      if (q.requestedBy === w.me && !w.isOwner) return "Không tự duyệt được đề xuất của chính mình";
      if (q.kind === "order_payment") {
        const o = s.orders.find((x) => x.id === q.ref?.split("#")[0]);
        const p = o?.payments[Number(q.ref?.split("#")[1])];
        if (p?.recordedBy === w.userId && !w.isOwner)
          return "Người ghi nhận không tự xác nhận khoản của mình";
      }
      return null;
    }
    case "setSettings": {
      const keys = Object.keys((a.patch as object) ?? {});
      return keys.length && keys.every((k) => has(w, SETTING_PERM[k] ?? "settings.integrations")) ? null : NO;
    }
    case "audit":
      return null;
    case "createStockDoc":
      return has(w, "inventory.document") ? null : NO;
    case "postStockDoc":
      return has(w, "inventory.post") ? null : NO;
    case "orderPayment": {
      const o = order();
      if (!has(w, "payment.record") || !orderEditable(o, w)) return NO;
      return Number(a.amount) > 0 ? null : "Số tiền phải lớn hơn 0";
    }
    case "chatSend":
    case "chatLike": {
      const c = s.chats.find((x) => x.id === str("chatId"));
      if (!c || !c.members.includes(w.me)) return "Anh chị không ở trong nhóm này";
      if (a.type === "chatSend" && c.kind === "channel" && !c.admins.includes(w.me))
        return "Kênh thông báo chỉ quản trị kênh đăng tin";
      return null;
    }
    case "chatPin": {
      const c = s.chats.find((x) => x.id === str("chatId"));
      return c && c.admins.includes(w.me) ? null : "Chỉ quản trị nhóm ghim tin";
    }
    case "notifyPrefs":
      return str("who") === w.me ? null : "Chỉ chỉnh được thông báo của chính mình";
    case "notifyTest":
      return str("who") === w.me ? null : NO;
    case "tgReply": {
      // Tin từ Telegram chạy đúng thao tác CRM tương ứng, nên kiểm như khi bấm trên màn CRM.
      if (action.type !== "tgReply" || action.who !== w.me) return NO;
      const plan = planTgReply(s, action);
      return plan.action ? deniedReason(s, plan.action, w) : null;
    }
    case "chatTopicCreate": {
      const c = s.chats.find((x) => x.id === str("chatId"));
      if (!c || !c.members.includes(w.me)) return "Anh chị không ở trong nhóm này";
      return c.kind === "channel" ? "Kênh thông báo không tạo chủ đề" : null;
    }
    case "createOrderManual":
      return has(w, "order.create") ? null : NO;
    case "editOrder":
      return orderEditable(order(), w) ? null : NO;
    case "orderRefund":
      return has(w, "payment.refund") ? null : NO;
    case "orderAdvance":
    case "orderWarehouse":
    case "orderHandover":
      return orderEditable(order(), w) || has(w, "delivery.update") ? null : NO;
    case "orderIssueStock":
      return has(w, "inventory.post") ? null : NO;
    case "orderCod": {
      const o = order();
      if (!o || !has(w, "payment.confirm")) return NO;
      return orderMine(o, w) && !w.isOwner ? "Người bán không tự duyệt thu khi giao cho đơn của mình" : null;
    }
    case "orderBackorder":
      return has(w, "order.allow_backorder") ? null : NO;
    case "orderCancel":
      return has(w, "order.cancel") ? null : NO;
    case "consentChange":
    case "customerEvent":
      return has(w, "lead.edit_own") || has(w, "lead.edit_all") ? null : NO;
    case "customerAnonymize":
      return w.isOwner ? null : NO;
    case "setTarget":
      return has(w, "target.manage") ? null : NO;
    case "addAbsence":
      return has(w, "staff.manage") ? null : NO;
    case "addCoaching":
    case "shareCoaching":
      return has(w, "coaching.manage") ? null : NO;
    case "offboardLock":
    case "offboardTransfer":
      return has(w, "staff.offboard") ? null : NO;
    case "intConfig":
    case "intSecret":
    case "intConnect":
    case "intQuick":
    case "intTest":
    case "intHydrate":
    case "intPause":
    case "intDisconnect":
      return has(w, "settings.integrations") ? null : NO;
    case "restore":
      return null;
    default:
      return NO;
  }
}
