"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";

import { useToast } from "@/components/ui/toast";
import {
  CATALOGS,
  LEAD_INFO,
  MARKETS_SEED,
  SHIFTS_SEED,
  TASKS_SEED,
  TASK_RULES_SEED,
  missingInfo,
  newLeadInfo,
  type CatalogItem,
  type LeadInfo,
  type MarketSetting,
  type Shift,
  type Task,
  type TaskRule,
} from "@/lib/demo/ops-data";
import { POLICIES } from "@/lib/demo/sales-catalog";
import { routeLead, type Receiver } from "@/lib/leads/assign";
import { decideIntake, type IntakeDecision, type KnownContact, type KnownLead } from "@/lib/leads/dedupe";
import type { ImportRow } from "@/lib/leads/import";
import { weeklyWindows, type MarketWindows } from "@/lib/leads/windows";
import { maskPhone, normalizePhone } from "@/lib/phone";
import type { Policy, QuoteInput, QuoteResult } from "@/lib/sales/pricing";
import { CUSTOMERS, KPIS, ORDERS, PRODUCTS, STAFF, STOCK, VARIANTS, type Order } from "@/lib/demo/data";
import { fromChannelList, type Consent } from "@/lib/cdp/consent";
import {
  applyMovements,
  levelOf,
  planDocument,
  reserve,
  type DocumentKind,
  type Movement,
  type StockLevel,
} from "@/lib/sales/inventory";
import { NEXT_STATUS, transitionBlockers, type OrderFacts, type OrderStatus } from "@/lib/sales/orders";
import {
  AGENTS,
  CHAIRS,
  CONVERSATIONS,
  DELIVERIES,
  DELIVERY_STEPS,
  HOUSES,
  KR_CITIES,
  KR_NAMES,
  OPPORTUNITIES,
  PROVINCES,
  STAGES,
  agentById,
  tr,
  type AgentId,
  type Conversation,
  type Delivery,
  type Opportunity,
} from "@/lib/demo/crm-data";

// Trạng thái mô phỏng của bản demo: agent chạy theo thời gian, hàng chờ duyệt, nhật ký, cơ hội, đơn, hội thoại.
// Chỉ sống trong trình duyệt; tải lại trang là về trạng thái ban đầu. Khi có bảng thật, các hành động ở đây
// được thay bằng server action, giao diện giữ nguyên.

export interface FeedItem {
  id: string;
  agent: AgentId;
  text: string;
  result: string;
  money: boolean;
  time: string;
}

export interface QueueItem {
  id: string;
  /** agent: đề xuất của agent AI; discount: báo giá giảm vượt mức; payment: xác nhận tiền đã về. */
  kind: "agent" | "discount" | "payment" | "stock_count" | "order_payment";
  agent: AgentId;
  text: string;
  why: string;
  okText: string;
  time: string;
  /** Quyền cần có để duyệt. */
  perm: string;
  /** Người đề xuất; người đề xuất không tự duyệt được (trừ Owner, có ghi nhận riêng). */
  requestedBy?: string;
  ref?: string;
}

export interface Activity {
  id: string;
  oppId: string;
  time: string;
  kind: "call" | "zalo" | "note" | "stage" | "quote" | "payment" | "task" | "info" | "reveal" | "delivery";
  text: string;
  actor: string;
}

export interface QuoteRec {
  id: string;
  token: string;
  oppId: string;
  lines: QuoteInput["lines"];
  province: string;
  result: QuoteResult;
  status: "pending_approval" | "sent" | "viewed" | "accepted" | "rejected";
  createdBy: string;
  time: string;
  validUntil: string;
}

export interface PaymentRec {
  id: string;
  deliveryId: string;
  type: "deposit" | "balance";
  method: string;
  amount: number;
  reference: string;
  status: "recorded" | "confirmed" | "rejected";
  recordedBy: string;
  confirmedBy?: string;
  time: string;
}

export interface AuditEntry {
  id: string;
  time: string;
  actor: string;
  action: string;
  entity: string;
  detail: string;
}

export type ReplyMode = "crm" | "external" | "off";

export interface ReceiverState {
  name: string;
  canReceive: boolean;
  active: boolean;
  onDuty: boolean;
  absent: boolean;
}

/** Dữ liệu phân lead và SLA của một cơ hội; thời gian là phút mô phỏng. */
export interface LeadMeta {
  phoneE164: string | null;
  phoneInvalid?: boolean;
  createdAt: number;
  assignedAt?: number;
  slaDue?: number;
  firstContactAt?: number;
  windowUntil?: number;
}

export interface ClosedLead {
  id: string;
  name: string;
  phoneE164: string;
  stage: "lost" | "won";
  closedAt: number;
  reason: string;
  owner: string;
}

export interface StockDoc {
  id: string;
  kind: DocumentKind;
  warehouseId: string;
  toWarehouseId?: string;
  reason: string;
  lines: { variantId: string; qty?: number; counted?: number }[];
  status: "draft" | "pending_approval" | "posted" | "rejected";
  createdBy: string;
  time: string;
  errors: string[];
  /** Chênh lệch kiểm kê chờ duyệt (sinh lúc gửi duyệt). */
  planned?: Movement[];
}

export interface LedgerRow extends Movement {
  id: string;
  time: string;
  actor: string;
}

export interface OrderRec extends Order {
  warehouseId: string;
  /** Cho đặt trước khi chưa đủ hàng (cần `order.allow_backorder`), kèm ngày dự kiến có hàng. */
  backorder?: { expected: string };
  stockIssued: boolean;
  codApproved: boolean;
  cancelReason?: string;
}

/** Thay đổi trên hồ sơ khách trong phiên mô phỏng: đồng ý, ẩn danh hóa, sự kiện mới. */
export interface CustomerCare {
  consents: Consent[];
  anonymized?: boolean;
  events: { at: string; kind: string; title: string; detail: string }[];
}

export interface Absence {
  id: string;
  staffId: string;
  date: string;
  kind: "Nghỉ phép" | "Nghỉ ốm" | "Công tác";
  approvedBy: string;
}

export interface CoachingNote {
  id: string;
  staffId: string;
  authorId: string;
  author: string;
  date: string;
  text: string;
  goal: string;
  shared: boolean;
}

export interface Warranty {
  id: string;
  orderId: string;
  orderCode: string;
  product: string;
  serial: string;
  owner: string;
  start: string;
  end: string;
}

export interface Settings {
  callMode: "external" | "provider";
  slaMinutes: number;
  maxUncontacted: number;
  markets: MarketSetting[];
  shifts: Shift[];
  taskRules: TaskRule[];
  catalogs: Record<string, { title: string; items: CatalogItem[] }>;
  replyMode: Record<string, ReplyMode>;
  prereqs: Record<string, string[]>;
  connected: string[];
  policies: Policy[];
}

interface State {
  minutes: number;
  revenue: number;
  leadsToday: number;
  autoCount: number;
  agentOn: Record<AgentId, boolean>;
  agentCount: Record<AgentId, number>;
  feed: FeedItem[];
  queue: QueueItem[];
  paused: boolean;
  opps: Opportunity[];
  oppSel: string;
  deliveries: Delivery[];
  delSel: string;
  convs: Conversation[];
  convSel: string;
  houseSel: string;
  crossDone: string[];
  occasionsDone: string[];
  traceSel: string | null;
  seq: number;
  leadInfo: Record<string, LeadInfo>;
  activities: Activity[];
  tasks: Task[];
  quotes: QuoteRec[];
  payments: PaymentRec[];
  audit: AuditEntry[];
  settings: Settings;
  receivers: ReceiverState[];
  lastAssigned: string | null;
  leadMeta: Record<string, LeadMeta>;
  closedLeads: ClosedLead[];
  stock: StockLevel[];
  ledger: LedgerRow[];
  stockDocs: StockDoc[];
  orders: OrderRec[];
  warranties: Warranty[];
  customerCare: Record<string, CustomerCare>;
  /** Chỉ tiêu tháng theo người: doanh thu cọc (đồng), số cuộc gọi mỗi ngày. */
  targets: Record<string, { revenue: number; calls: number }>;
  absences: Absence[];
  coaching: CoachingNote[];
  offboarded: string[];
}

/** Ngày giờ thật tương ứng với phút mô phỏng (ngày 04/10/2026, giờ VN). */
export const simDate = (m: number) => new Date(Date.UTC(2026, 9, 3, 17, 0) + m * 60_000);

/** Hạn của việc: giờ hôm nay, ngày mai, hoặc ngày/tháng. */
export function fmtDue(due: number): string {
  const day = Math.floor(due / 1440);
  const t = fmtMinutes(due);
  if (day === 0) return `${t} hôm nay`;
  if (day === 1) return `${t} ngày mai`;
  const d = new Date(Date.UTC(2026, 9, 4 + day));
  return `${t} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const fmtMinutes = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ---------------------------------------------------------------------------
// Sinh sự kiện agent (giống nhịp của bản mẫu)
// ---------------------------------------------------------------------------

type Rand = () => number;
const pick = <T,>(r: Rand, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

function mulberry32(seed: number): Rand {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function agentEvent(
  r: Rand,
  id: AgentId,
): { text: string; result: string; revenue?: number; newLead?: boolean } {
  switch (id) {
    case "lead":
      return r() < 0.5
        ? {
            text: `Lead mới từ Facebook Ads Hàn: ${pick(r, KR_NAMES)} ở ${pick(r, KR_CITIES)}, muốn tặng bố mẹ ở ${pick(r, PROVINCES)}. Đã giao Thảo`,
            result: "Đã phân",
            newLead: true,
          }
        : {
            text: `Lead từ live TikTok: tài khoản hỏi giá DV-X9, ship ${pick(r, PROVINCES)}. Đã tạo hồ sơ và giao Thảo`,
            result: "Đã phân",
            newLead: true,
          };
    case "tele":
      return r() < 0.5
        ? {
            text: `Tóm tắt cuộc gọi Thảo với ${pick(r, KR_NAMES)}: tặng bố dịp Tết, ngân sách khoảng 50tr, cần lắp tận nhà`,
            result: "Đã ghi",
          }
        : {
            text: `Gợi ý kịch bản cho Thảo: khách ${pick(r, KR_NAMES)} lo mua online bị lừa, đề xuất mời video call xem ghế thật`,
            result: "Đã gợi ý",
          };
    case "nurture": {
      if (r() < 0.5)
        return {
          text: `Gửi video bàn giao của một hộ ở ${pick(r, PROVINCES)} cho lead cũ ${pick(r, KR_NAMES)}, 38 ngày chưa phản hồi`,
          result: "Đã gửi",
        };
      const [p, v] = pick(r, CHAIRS);
      return {
        text: `${pick(r, KR_NAMES)} chuyển cọc 10tr từ Hàn cho ${p}`,
        result: `+${tr(v)}`,
        revenue: v,
      };
    }
    case "occasion":
      return r() < 0.5
        ? { text: `Nhắc ${pick(r, KR_NAMES)}: còn 16 ngày tới 20/10, gợi ý quà cho mẹ`, result: "Đã gửi" }
        : {
            text: `Nhắc ${pick(r, KR_NAMES)}: bố tròn 70 tuổi tháng 11, gợi ý gói quà mừng thọ`,
            result: "Đã gửi",
          };
    case "trust":
      return r() < 0.5
        ? {
            text: `Gửi video bàn giao tại nhà bố mẹ ở ${pick(r, PROVINCES)} cho ${pick(r, KR_NAMES)}`,
            result: "Đã gửi",
          }
        : { text: `${pick(r, KR_NAMES)} đánh giá 5 sao sau 3 ngày bố mẹ dùng ghế`, result: "Đánh giá" };
    case "house":
      return {
        text: `Gộp người nhận ở ${pick(r, PROVINCES)} vào hộ của ${pick(r, KR_NAMES)}: trùng địa chỉ giao và số người nhận`,
        result: "Đã gộp",
      };
  }
}

function approvalEvent(r: Rand): Omit<QueueItem, "id" | "time" | "kind" | "perm"> {
  const k = pick(r, KR_NAMES);
  const roll = r();
  if (roll < 0.34)
    return {
      agent: "tele",
      text: `Đề xuất giảm 7% DV-X9 cho ${k}, khách đang so giá với đối thủ`,
      why: "Giảm giá trên 5% cần quản lý showroom duyệt",
      okText: `Đã duyệt giảm 7% cho ${k}`,
    };
  if (roll < 0.67)
    return {
      agent: "occasion",
      text: `Đề xuất gọi người nhận ở ${pick(r, PROVINCES)} để hẹn giao trước Tết cho đơn của ${k}`,
      why: "Liên hệ người nhận cần người tặng đồng ý",
      okText: `Đã xin phép ${k}, chờ khách đồng ý`,
    };
  return {
    agent: "tele",
    text: `Đề xuất tặng kèm máy massage chân cho đơn 2 ghế của ${k}`,
    why: "Quà tặng trên 3 triệu",
    okText: `Đã duyệt quà tặng cho ${k}`,
  };
}

function step(s: State, r: Rand): State {
  const active = AGENTS.filter((a) => s.agentOn[a.id]);
  if (!active.length) return s;
  const minutes = s.minutes + 1 + Math.floor(r() * 3);
  const time = fmtMinutes(minutes);
  const seq = s.seq + 1;
  if (r() < 0.22) {
    const e = approvalEvent(r);
    if (!s.agentOn[e.agent]) return { ...s, minutes, seq };
    return {
      ...s,
      minutes,
      seq,
      queue: [{ ...e, kind: "agent", perm: "order.discount_approve", id: `q${seq}`, time }, ...s.queue],
      agentCount: { ...s.agentCount, [e.agent]: s.agentCount[e.agent] + 1 },
    };
  }
  const a = pick(r, active);
  const e = agentEvent(r, a.id);
  return {
    ...s,
    minutes,
    seq,
    revenue: s.revenue + (e.revenue ?? 0),
    leadsToday: s.leadsToday + (e.newLead ? 1 : 0),
    autoCount: s.autoCount + 1,
    agentCount: { ...s.agentCount, [a.id]: s.agentCount[a.id] + 1 },
    feed: [
      { id: `f${seq}`, agent: a.id, text: e.text, result: e.result, money: Boolean(e.revenue), time },
      ...s.feed,
    ].slice(0, 40),
  };
}

function initialState(): State {
  const zero = Object.fromEntries(AGENTS.map((a) => [a.id, 0])) as Record<AgentId, number>;
  let s: State = {
    minutes: 9 * 60 + 12,
    revenue: 186,
    leadsToday: 23,
    autoCount: 0,
    agentOn: Object.fromEntries(AGENTS.map((a) => [a.id, true])) as Record<AgentId, boolean>,
    agentCount: zero,
    feed: [],
    queue: [],
    paused: false,
    opps: OPPORTUNITIES,
    oppSel: "o1",
    deliveries: DELIVERIES,
    delSel: "DV-1027",
    convs: CONVERSATIONS,
    convSel: "v1",
    houseSel: "h1",
    crossDone: [],
    occasionsDone: [],
    traceSel: null,
    seq: 0,
    leadInfo: LEAD_INFO,
    receivers: [
      { name: "Thảo", canReceive: true, active: true, onDuty: true, absent: false },
      { name: "An", canReceive: true, active: true, onDuty: false, absent: false },
      { name: "Phương", canReceive: true, active: true, onDuty: false, absent: false },
    ],
    lastAssigned: "Thảo",
    leadMeta: Object.fromEntries(
      Object.entries(LEAD_INFO).map(([id, info]) => {
        const p = normalizePhone(info.buyerPhone, info.market);
        const fresh = id === "o5";
        return [
          id,
          {
            phoneE164: p.valid ? p.e164 : null,
            createdAt: fresh ? 9 * 60 : -1440,
            assignedAt: fresh ? 9 * 60 + 12 : -1440,
            slaDue: fresh ? 9 * 60 + 17 : -1435,
            firstContactAt: fresh ? undefined : -1430,
          } satisfies LeadMeta,
        ];
      }),
    ),
    stock: STOCK.map(([variantId, warehouseId, onHand, reserved]) => ({
      variantId,
      warehouseId,
      onHand,
      reserved,
    })),
    ledger: [],
    stockDocs: [],
    orders: ORDERS.map((o) => ({
      ...o,
      warehouseId: "wh-q4",
      stockIssued: ["delivering", "installed", "completed"].includes(o.status),
      codApproved: false,
    })),
    warranties: [],
    customerCare: {},
    targets: Object.fromEntries(
      KPIS.map((k) => [k.staffId, { revenue: k.revenueTarget, calls: k.callsTarget }]),
    ),
    absences: [],
    coaching: [
      {
        id: "cn1",
        staffId: "11111111-1111-4111-8111-000000000005",
        authorId: "11111111-1111-4111-8111-000000000002",
        author: "Minh",
        date: "2026-10-02",
        text: "Phương đánh thất bại 3 lead khi mới gọi 1 lần. Cần gọi đủ các khung giờ trước khi đóng.",
        goal: "Không đánh thất bại khi chưa đủ 3 lần liên hệ",
        shared: false,
      },
    ],
    offboarded: [],
    closedLeads: [
      {
        id: "x1",
        name: "Trần Thị Bích",
        phoneE164: "+84908123344",
        stage: "lost",
        closedAt: -10 * 1440,
        reason: "Giá cao",
        owner: "Thảo",
      },
      {
        id: "x2",
        name: "Đỗ Văn Hậu",
        phoneE164: "+821077778888",
        stage: "lost",
        closedAt: -45 * 1440,
        reason: "Chưa tin mua từ xa",
        owner: "Thảo",
      },
    ],
    activities: [
      {
        id: "a1",
        oppId: "o1",
        time: "30/09",
        kind: "info",
        text: "Lead từ Facebook Ads nhắm người Việt tại Hàn, đã đồng ý nhận tư vấn",
        actor: "Hệ thống",
      },
      {
        id: "a2",
        oppId: "o1",
        time: "01/10",
        kind: "call",
        text: "Gọi điện thoại · Nghe máy, quan tâm · Tặng bố mẹ ở Nghệ An dịp Tết, ngân sách trên 80tr",
        actor: "Thảo",
      },
      {
        id: "a3",
        oppId: "o1",
        time: "02/10",
        kind: "quote",
        text: "Gửi báo giá DV-X9, khách đã xem 2 lần",
        actor: "Thảo",
      },
      {
        id: "a4",
        oppId: "o1",
        time: "03/10",
        kind: "zalo",
        text: "Khách hỏi lắp tận Nghệ An, lo mua online bị lừa",
        actor: "Khách",
      },
      {
        id: "a5",
        oppId: "o3",
        time: "20/08",
        kind: "info",
        text: "Lead từ quảng cáo, sau đó không nghe máy 3 lần",
        actor: "Hệ thống",
      },
      {
        id: "a6",
        oppId: "o3",
        time: "04/10",
        kind: "zalo",
        text: "Phản hồi tin nhắc 20/10, hỏi còn ưu đãi không",
        actor: "Khách",
      },
    ],
    tasks: TASKS_SEED,
    quotes: [],
    payments: [],
    audit: [
      {
        id: "au1",
        time: "03/10 16:20",
        actor: "Hà",
        action: "Bật quyền",
        entity: "Sale admin",
        detail: "Xuất danh sách khách ra file",
      },
      {
        id: "au2",
        time: "04/10 08:41",
        actor: "Thảo",
        action: "Xem số điện thoại",
        entity: "Lead Nguyễn Thị Thu",
        detail: "Số người đặt, chế độ gọi ngoài hệ thống",
      },
    ],
    settings: {
      callMode: "external",
      slaMinutes: 5,
      maxUncontacted: 8,
      markets: MARKETS_SEED,
      shifts: SHIFTS_SEED,
      taskRules: TASK_RULES_SEED,
      catalogs: CATALOGS,
      replyMode: { zalo_oa: "crm", meta_messenger: "external", pancake: "external", tiktok_messaging: "off" },
      prereqs: { zalo_oa: ["oa_verified"], email_smtp: ["domain"] },
      connected: [],
      policies: POLICIES,
    },
  };
  // Dữ liệu ban đầu sinh bằng hạt cố định để server và trình duyệt hiển thị giống nhau.
  const r = mulberry32(20261004);
  for (let i = 0; i < 10; i++) s = step(s, r);
  return s;
}

// ---------------------------------------------------------------------------
// Hành động
// ---------------------------------------------------------------------------

type Action =
  | { type: "tick" }
  | { type: "togglePause" }
  | { type: "decide"; id: string; ok: boolean }
  | { type: "toggleAgent"; id: AgentId }
  | { type: "selectOpp"; id: string }
  | { type: "advanceOpp"; actor?: string }
  | { type: "loseOpp"; reason?: string; actor?: string }
  | { type: "callOpp"; id: string }
  | { type: "assignOccasion"; label: string }
  | { type: "selectHouse"; id: string }
  | { type: "createCross"; houseId: string; index: number }
  | { type: "selectDelivery"; id: string }
  | { type: "advanceDelivery" }
  | { type: "selectConv"; id: string }
  | { type: "takeOver" }
  | { type: "closeConv" }
  | { type: "reply"; text: string }
  | { type: "customerFollowUp"; convId: string }
  | { type: "selectTrace"; id: string }
  | { type: "updateLeadInfo"; oppId: string; patch: Partial<LeadInfo>; actor: string }
  | { type: "revealPhone"; oppId: string; who: "buyer" | "recipient"; actor: string }
  | {
      type: "logCall";
      oppId: string;
      channel: "Điện thoại" | "Zalo" | "Tổng đài";
      outcome: string;
      note: string;
      callbackAt?: number;
      actor: string;
    }
  | { type: "addNote"; oppId: string; text: string; actor: string }
  | { type: "addDate"; oppId: string; label: string; date: string; actor: string }
  | { type: "completeTask"; id: string; outcome: string; actor: string }
  | { type: "missTask"; id: string; actor: string }
  | {
      type: "sendQuote";
      oppId: string;
      token: string;
      lines: QuoteInput["lines"];
      province: string;
      result: QuoteResult;
      actor: string;
    }
  | { type: "markQuote"; id: string; status: "viewed" | "accepted" | "rejected"; actor: string }
  | {
      type: "recordPayment";
      deliveryId: string;
      payType: "deposit" | "balance";
      method: string;
      amount: number;
      reference: string;
      actor: string;
    }
  | { type: "approve"; id: string; ok: boolean; actor: string; isOwner: boolean }
  | { type: "setSettings"; patch: Partial<Settings>; actor: string; label: string; detail?: string }
  | { type: "audit"; actor: string; action: string; entity: string; detail: string }
  | {
      type: "createLead";
      name: string;
      phoneRaw: string;
      market: "KR" | "VN" | "unknown";
      source: string;
      product: string;
      note: string;
      actor: string;
    }
  | { type: "assignLead"; oppId: string; to: string; actor: string }
  | { type: "toggleDuty"; name: string; actor: string }
  | { type: "importLeads"; rows: ImportRow[]; duplicateMode: "skip" | "update" | "activity"; actor: string }
  | {
      type: "createStockDoc";
      kind: DocumentKind;
      warehouseId: string;
      toWarehouseId?: string;
      reason: string;
      lines: { variantId: string; qty?: number; counted?: number }[];
      actor: string;
    }
  | { type: "postStockDoc"; id: string; actor: string }
  | {
      type: "orderPayment";
      orderId: string;
      payType: "deposit" | "balance";
      method: string;
      amount: number;
      reference: string;
      actorId: string;
      actor: string;
    }
  | { type: "orderAdvance"; orderId: string; actor: string }
  | { type: "orderIssueStock"; orderId: string; actor: string }
  | { type: "orderCod"; orderId: string; actor: string }
  | { type: "setTarget"; staffId: string; revenue: number; calls: number; actor: string }
  | { type: "addAbsence"; staffId: string; date: string; kind: Absence["kind"]; actor: string }
  | { type: "addCoaching"; note: Omit<CoachingNote, "id">; actor: string }
  | { type: "shareCoaching"; id: string; shared: boolean; actor: string }
  | { type: "offboardLock"; staffId: string; actor: string }
  | { type: "offboardTransfer"; staffId: string; to: string[]; actor: string }
  | { type: "consentChange"; customerId: string; consent: Consent; withdraw: boolean; actor: string }
  | { type: "customerEvent"; customerId: string; kind: string; title: string; detail: string }
  | { type: "customerAnonymize"; customerId: string; actor: string }
  | { type: "orderWarehouse"; orderId: string; warehouseId: string; actor: string }
  | { type: "orderBackorder"; orderId: string; expected: string; actor: string }
  | { type: "orderCancel"; orderId: string; reason: string; actor: string };

function pushFeed(s: State, agent: AgentId, text: string, result: string, money = false): State {
  const minutes = s.minutes + 1;
  const seq = s.seq + 1;
  return {
    ...s,
    minutes,
    seq,
    feed: [{ id: `f${seq}`, agent, text, result, money, time: fmtMinutes(minutes) }, ...s.feed].slice(0, 40),
  };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "tick":
      return releaseWaiting(s.paused ? s : step(s, Math.random));
    case "togglePause":
      return { ...s, paused: !s.paused };
    case "decide": {
      const q = s.queue.find((x) => x.id === a.id);
      if (!q) return s;
      if (q.kind !== "agent")
        return reducer(s, { type: "approve", id: a.id, ok: a.ok, actor: "Quản lý", isOwner: true });
      const rest = { ...s, queue: s.queue.filter((x) => x.id !== a.id) };
      return a.ok
        ? { ...pushFeed(rest, q.agent, q.okText, "Quản lý đã duyệt"), autoCount: s.autoCount + 1 }
        : pushFeed(rest, q.agent, `Từ chối: ${q.text}`, "Từ chối");
    }
    case "toggleAgent":
      return { ...s, agentOn: { ...s.agentOn, [a.id]: !s.agentOn[a.id] } };
    case "selectOpp":
      return { ...s, oppSel: a.id };
    case "advanceOpp": {
      // Người chỉ chuyển tay Lead mới → Đã liên hệ → Demo; từ Báo giá trở đi do báo giá và đơn sinh ra.
      const o = s.opps.find((x) => x.id === s.oppSel);
      if (!o || o.stage >= 2) return s;
      if (o.stage === 1 && missingInfo(s.leadInfo[o.id] ?? newLeadInfo("VN")).length) return s;
      const ns = setStage(s, o.id, o.stage + 1);
      return addActivity(ns, o.id, "stage", `Chuyển sang ${STAGES[o.stage + 1]}`, a.actor ?? o.owner);
    }
    case "loseOpp": {
      // Đánh thất bại hủy các việc đã lên lịch kèm lý do, không xóa (CLAUDE.md mục 6).
      const id = s.oppSel;
      const lost = s.opps.find((x) => x.id === id);
      const opps = s.opps.filter((x) => x.id !== id);
      const phone = s.leadMeta[id]?.phoneE164;
      return {
        ...s,
        opps,
        closedLeads:
          lost && phone
            ? [
                {
                  id,
                  name: lost.name,
                  phoneE164: phone,
                  stage: "lost",
                  closedAt: s.minutes,
                  reason: a.reason ?? "",
                  owner: lost.owner,
                },
                ...s.closedLeads,
              ]
            : s.closedLeads,
        oppSel: opps[0]?.id ?? "",
        tasks: s.tasks.map((t) =>
          t.oppId === id && t.status === "open"
            ? { ...t, status: "cancelled", outcome: `Lead thất bại: ${a.reason ?? ""}` }
            : t,
        ),
      };
    }
    case "callOpp": {
      const o = s.opps.find((x) => x.id === a.id);
      if (!o) return s;
      const opps = s.opps.map((x) => (x.id === o.id && x.stage < 1 ? { ...x, stage: 1 } : x));
      return pushFeed(
        { ...s, opps },
        "tele",
        `Thảo gọi ${o.name} lúc ${fmtMinutes(s.minutes + 121)} giờ Hàn. Đang ghi và tóm tắt cuộc gọi`,
        "Đang gọi",
      );
    }
    case "assignOccasion":
      return {
        ...pushFeed(
          s,
          "occasion",
          `Nhận chiến dịch ${a.label}: lên lịch nhắc người tặng trong các hộ phù hợp`,
          "Đã lên lịch",
        ),
        occasionsDone: [...s.occasionsDone, a.label],
        agentCount: { ...s.agentCount, occasion: s.agentCount.occasion + 1 },
      };
    case "selectHouse":
      return { ...s, houseSel: a.id };
    case "createCross": {
      const h = HOUSES.find((x) => x.id === a.houseId);
      const c = h?.cross[a.index];
      if (!h || !c) return s;
      const m = h.members.find((x) => x.name === c.to) ?? h.members[0];
      const opp: Opportunity = {
        id: `o${s.seq + 100}`,
        name: c.to,
        city: m.loc === "KR" ? m.city : "",
        to: h.place.split(",")[0],
        product: c.title,
        value: c.value,
        stage: 0,
        source: "Bán chéo hộ gia đình",
        owner: "Thảo",
        score: 70,
        occasion: "",
        houseId: h.id,
        next: c.detail,
      };
      return {
        ...pushFeed(
          {
            ...s,
            opps: [opp, ...s.opps],
            leadInfo: {
              ...s.leadInfo,
              [opp.id]: {
                ...newLeadInfo(m.loc),
                buyFor: "other",
                recipientName:
                  h.members.find((x) => x.role !== "Người đặt" && x.role !== "Tiềm năng")?.name ?? "",
                recipientRelation: "Bố mẹ",
                recipientProvince: h.place.split(", ").pop() ?? "",
              },
            },
          },
          "house",
          `Tạo cơ hội "${c.title}" cho ${c.to}`,
          "Đã tạo",
        ),
        crossDone: [...s.crossDone, `${h.id}:${a.index}`],
        agentCount: { ...s.agentCount, house: s.agentCount.house + 1 },
      };
    }
    case "selectDelivery":
      return { ...s, delSel: a.id };
    case "advanceDelivery": {
      const d = s.deliveries.find((x) => x.id === s.delSel);
      if (!d || d.step >= 5) return s;
      // Xuất kho cần thu đủ tiền theo chính sách thanh toán (đơn sinh trong phiên mô phỏng).
      if (d.step === 1 && d.totalVnd !== undefined && (d.paidVnd ?? 0) < d.totalVnd) return s;
      let ns = s;
      if (d.step === 1 && d.oppId) ns = setStage(ns, d.oppId, 5);
      if (d.step === 4) ns = completeDelivery(ns, d);
      if (d.step === 3) ns = pushFeed(ns, "trust", `Gửi video bàn giao đơn ${d.id} cho ${d.buyer}`, "Đã gửi");
      if (d.step === 4) ns = pushFeed(ns, "trust", `Xin đánh giá từ ${d.buyer} cho đơn ${d.id}`, "Đã gửi");
      const next = { ...d, step: d.step + 1, flag: d.step === 0 || d.step === 2 ? null : d.flag };
      return { ...ns, deliveries: ns.deliveries.map((x) => (x.id === d.id ? next : x)) };
    }
    case "selectConv":
      return { ...s, convSel: a.id };
    case "takeOver":
      return updateConv(s, s.convSel, (c) => ({
        ...c,
        status: "human",
        messages: [...c.messages, ["sys", "Nhân viên đã tiếp quản từ agent", fmtMinutes(s.minutes)]],
      }));
    case "closeConv":
      return updateConv(s, s.convSel, (c) => ({ ...c, status: "done" }));
    case "reply": {
      const minutes = s.minutes + 1;
      return {
        ...updateConv({ ...s, minutes }, s.convSel, (c) => ({
          ...c,
          status: c.status === "need" || c.status === "agent" ? "human" : c.status,
          time: fmtMinutes(minutes),
          messages: [...c.messages, ["hu", a.text, fmtMinutes(minutes)]],
        })),
      };
    }
    case "customerFollowUp": {
      const c = s.convs.find((x) => x.id === a.convId);
      if (!c?.followUp) return s;
      const minutes = s.minutes + 1;
      const t = fmtMinutes(minutes);
      let ns = updateConv({ ...s, minutes }, c.id, (x) => ({
        ...x,
        followUp: undefined,
        worried: false,
        status: "done",
        messages: [
          ...x.messages,
          ["cu", c.followUp!, t],
          [
            "sys",
            "AI: khách đồng ý video call. Đã tạo lịch 21:00 giờ Hàn cho My, chuyển cơ hội sang bước Demo",
            t,
          ],
        ],
      }));
      if (c.moveOpportunity) {
        ns = {
          ...ns,
          opps: ns.opps.map((o) =>
            o.id === c.moveOpportunity
              ? {
                  ...o,
                  stage: 2,
                  score: 78,
                  next: "Video call 21:00 giờ Hàn tối nay. My chuẩn bị demo phần massage chân như khách yêu cầu.",
                }
              : o,
          ),
        };
      }
      return pushFeed(
        ns,
        "tele",
        `${c.name} đồng ý video call 21:00 giờ Hàn, cơ hội lên bước Demo`,
        "Đã hẹn",
      );
    }
    case "selectTrace":
      return { ...s, traceSel: a.id };

    case "updateLeadInfo": {
      const before = s.leadInfo[a.oppId] ?? newLeadInfo("VN");
      const after = { ...before, ...a.patch };
      const ns = { ...s, leadInfo: { ...s.leadInfo, [a.oppId]: after } };
      const changed = Object.keys(a.patch).filter(
        (k) => before[k as keyof LeadInfo] !== after[k as keyof LeadInfo],
      );
      if (!changed.length) return s;
      const text =
        "keepSurprise" in a.patch
          ? after.keepSurprise
            ? "Bật Giữ bất ngờ: không liên hệ người nhận"
            : "Tắt Giữ bất ngờ: người đặt đã cho phép liên hệ người nhận"
          : `Cập nhật thông tin: ${changed.map((k) => INFO_LABEL[k] ?? k).join(", ")}`;
      return addActivity(ns, a.oppId, "info", text, a.actor);
    }
    case "revealPhone": {
      const o = s.opps.find((x) => x.id === a.oppId);
      return addAudit(
        addActivity(
          s,
          a.oppId,
          "reveal",
          `Xem số ${a.who === "buyer" ? "người đặt" : "người nhận"} để gọi`,
          a.actor,
        ),
        a.actor,
        "Xem số điện thoại",
        `Lead ${o?.name ?? a.oppId}`,
        `Số ${a.who === "buyer" ? "người đặt" : "người nhận"}, chế độ gọi ngoài hệ thống`,
      );
    }
    case "logCall": {
      const o = s.opps.find((x) => x.id === a.oppId);
      if (!o) return s;
      let ns = addActivity(
        s,
        a.oppId,
        a.channel === "Zalo" ? "zalo" : "call",
        `${a.channel === "Tổng đài" ? "Gọi qua tổng đài" : `Gọi ${a.channel === "Zalo" ? "qua Zalo" : "điện thoại"} (ghi tay)`} · ${a.outcome}${a.note ? ` · ${a.note}` : ""}`,
        a.actor,
      );
      // Liên hệ đi đầu tiên đặt giai đoạn Đã liên hệ, dừng đồng hồ SLA và đóng việc Liên hệ đầu tiên.
      if (o.stage === 0) ns = setStage(ns, o.id, 1);
      const meta = ns.leadMeta[o.id];
      if (meta && meta.firstContactAt === undefined)
        ns = { ...ns, leadMeta: { ...ns.leadMeta, [o.id]: { ...meta, firstContactAt: ns.minutes } } };
      ns = {
        ...ns,
        tasks: ns.tasks.map((t) =>
          t.oppId === o.id && t.status === "open" && (t.type === "first_contact" || t.type === "callback")
            ? { ...t, status: "done", outcome: a.outcome }
            : t,
        ),
      };
      if (a.callbackAt !== undefined) {
        ns = addTask(ns, {
          type: "callback",
          title: `Gọi lại ${o.name}${a.note ? `: ${a.note}` : ""}`,
          oppId: o.id,
          owner: o.owner,
          due: a.callbackAt,
          priority: "normal",
          source: "user",
        });
      }
      return ns;
    }
    case "addNote":
      return addActivity(s, a.oppId, "note", a.text, a.actor);
    case "addDate": {
      const info = s.leadInfo[a.oppId] ?? newLeadInfo("VN");
      const ns = {
        ...s,
        leadInfo: {
          ...s.leadInfo,
          [a.oppId]: { ...info, dates: [...info.dates, { label: a.label, date: a.date }] },
        },
      };
      return addActivity(ns, a.oppId, "info", `Thêm ngày quan trọng: ${a.label} ${a.date}`, a.actor);
    }
    case "completeTask": {
      const t = s.tasks.find((x) => x.id === a.id);
      if (!t) return s;
      const ns = {
        ...s,
        tasks: s.tasks.map((x) =>
          x.id === a.id ? { ...x, status: "done" as const, outcome: a.outcome } : x,
        ),
      };
      return t.oppId
        ? addActivity(
            ns,
            t.oppId,
            "task",
            `Hoàn thành: ${t.title}${a.outcome ? ` · ${a.outcome}` : ""}`,
            a.actor,
          )
        : ns;
    }
    case "missTask":
      return { ...s, tasks: s.tasks.map((x) => (x.id === a.id ? { ...x, status: "missed" as const } : x)) };

    case "sendQuote": {
      const o = s.opps.find((x) => x.id === a.oppId);
      if (!o) return s;
      const seq = s.seq + 1;
      const needs = a.result.approvalsNeeded;
      const q: QuoteRec = {
        id: `Q${1040 + seq}`,
        token: a.token,
        oppId: a.oppId,
        lines: a.lines,
        province: a.province,
        result: a.result,
        status: needs.length ? "pending_approval" : "sent",
        createdBy: a.actor,
        time: fmtMinutes(s.minutes),
        validUntil: "11/10/2026",
      };
      let ns: State = { ...s, seq, quotes: [q, ...s.quotes] };
      if (needs.length) {
        ns = {
          ...ns,
          queue: [
            {
              id: `qa${seq}`,
              kind: "discount",
              agent: "tele",
              text: `Báo giá ${q.id} cho ${o.name}: ${vnd(a.result.totals.total)}`,
              why: needs.map((n) => n.reason).join("; "),
              okText: `Đã duyệt báo giá ${q.id}`,
              time: fmtMinutes(s.minutes),
              perm: "order.discount_approve",
              requestedBy: a.actor,
              ref: q.id,
            },
            ...ns.queue,
          ],
        };
        return addActivity(ns, o.id, "quote", `Tạo báo giá ${q.id}, chờ duyệt giảm giá`, a.actor);
      }
      return markSent(ns, q.id, a.actor);
    }
    case "markQuote": {
      const q = s.quotes.find((x) => x.id === a.id);
      if (!q) return s;
      let ns: State = { ...s, quotes: s.quotes.map((x) => (x.id === a.id ? { ...x, status: a.status } : x)) };
      const label = { viewed: "Khách đã xem", accepted: "Khách đã đồng ý", rejected: "Khách từ chối" }[
        a.status
      ];
      ns = addActivity(ns, q.oppId, "quote", `${label} báo giá ${q.id}`, a.actor);
      if (a.status === "accepted") ns = createOrder(ns, q, a.actor);
      return ns;
    }
    case "recordPayment": {
      const seq = s.seq + 1;
      const d = s.deliveries.find((x) => x.id === a.deliveryId);
      if (!d) return s;
      const p: PaymentRec = {
        id: `P${700 + seq}`,
        deliveryId: a.deliveryId,
        type: a.payType,
        method: a.method,
        amount: a.amount,
        reference: a.reference,
        status: "recorded",
        recordedBy: a.actor,
        time: fmtMinutes(s.minutes),
      };
      let ns: State = {
        ...s,
        seq,
        payments: [p, ...s.payments],
        queue: [
          {
            id: `qp${seq}`,
            kind: "payment",
            agent: "trust",
            text: `Khoản ${a.payType === "deposit" ? "cọc" : "thanh toán"} ${vnd(a.amount)} của đơn ${d.id} (${d.buyer}), ${a.method}${a.reference ? `, nội dung "${a.reference}"` : ""}`,
            why: "Xác nhận tiền đã về tài khoản",
            okText: `Đã xác nhận ${vnd(a.amount)} cho đơn ${d.id}`,
            time: fmtMinutes(s.minutes),
            perm: "payment.confirm",
            requestedBy: a.actor,
            ref: p.id,
          },
          ...s.queue,
        ],
      };
      if (d.oppId)
        ns = addActivity(
          ns,
          d.oppId,
          "payment",
          `Ghi nhận ${vnd(a.amount)} (${a.method}), chờ xác nhận`,
          a.actor,
        );
      return ns;
    }
    case "approve": {
      const q = s.queue.find((x) => x.id === a.id);
      if (!q) return s;
      if (q.requestedBy === a.actor && !a.isOwner) return s;
      let ns: State = { ...s, queue: s.queue.filter((x) => x.id !== a.id) };
      const self = q.requestedBy === a.actor;
      ns = addAudit(
        ns,
        a.actor,
        a.ok ? (self ? "Tự duyệt (Owner)" : "Duyệt") : "Từ chối",
        q.kind === "stock_count"
          ? `Phiếu kiểm kê ${q.ref}`
          : q.kind === "order_payment"
            ? `Thanh toán đơn ${q.ref?.split("#")[0]}`
            : q.kind === "discount"
              ? `Báo giá ${q.ref}`
              : q.kind === "payment"
                ? `Thanh toán ${q.ref}`
                : "Đề xuất agent",
        q.text,
      );
      if (q.kind === "stock_count") {
        const doc = ns.stockDocs.find((d) => d.id === q.ref);
        if (!doc) return ns;
        if (!a.ok)
          return {
            ...ns,
            stockDocs: ns.stockDocs.map((d) => (d.id === doc.id ? { ...d, status: "rejected" } : d)),
          };
        return postMovements(ns, doc, doc.planned ?? [], a.actor);
      }
      if (q.kind === "order_payment") {
        const [orderId, idx] = (q.ref ?? "").split("#");
        return {
          ...ns,
          orders: ns.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  payments: o.payments.map((p, i) =>
                    i === Number(idx)
                      ? { ...p, status: a.ok ? ("confirmed" as const) : ("rejected" as const) }
                      : p,
                  ),
                }
              : o,
          ),
        };
      }
      if (q.kind === "discount") {
        const quote = ns.quotes.find((x) => x.id === q.ref);
        if (!quote) return ns;
        if (!a.ok) {
          ns = {
            ...ns,
            quotes: ns.quotes.map((x) => (x.id === quote.id ? { ...x, status: "rejected" } : x)),
          };
          return addActivity(ns, quote.oppId, "quote", `Báo giá ${quote.id} bị từ chối giảm giá`, a.actor);
        }
        return markSent(ns, quote.id, a.actor);
      }
      if (q.kind === "payment") {
        const p = ns.payments.find((x) => x.id === q.ref);
        if (!p) return ns;
        ns = {
          ...ns,
          payments: ns.payments.map((x) =>
            x.id === p.id ? { ...x, status: a.ok ? "confirmed" : "rejected", confirmedBy: a.actor } : x,
          ),
        };
        if (!a.ok) return ns;
        const d = ns.deliveries.find((x) => x.id === p.deliveryId)!;
        const paid = (d.paidVnd ?? 0) + p.amount;
        const full = d.totalVnd !== undefined && paid >= d.totalVnd;
        ns = {
          ...ns,
          deliveries: ns.deliveries.map((x) =>
            x.id === d.id
              ? { ...x, paidVnd: paid, payment: full ? "Đã thanh toán đủ" : `Đã thu ${vnd(paid)}` }
              : x,
          ),
        };
        if (d.oppId) {
          ns = addActivity(ns, d.oppId, "payment", `Xác nhận tiền về ${vnd(p.amount)}`, a.actor);
          const o = ns.opps.find((x) => x.id === d.oppId);
          // Đơn đã cọc đủ mức tối thiểu thì lead sang Đặt cọc (CLAUDE.md mục 6) và tính doanh thu đã cọc.
          if (o && o.stage < 4 && paid >= (d.depositMin ?? 0)) {
            ns = setStage(ns, o.id, 4);
            ns = {
              ...pushFeed(ns, "tele", `${o.name} đặt cọc ${o.product}`, `+${tr(o.value)}`, true),
              revenue: ns.revenue + o.value,
            };
            ns = addTask(ns, {
              type: "delivery_step",
              title: `Xác nhận người nhận và lịch giao đơn ${d.id}`,
              deliveryId: d.id,
              oppId: o.id,
              owner: o.owner,
              due: ns.minutes + 24 * 60,
              priority: "high",
              source: "rule",
              ruleKey: "confirm_recipient",
            });
          }
        }
        return ns;
      }
      return a.ok
        ? { ...pushFeed(ns, q.agent, q.okText, "Quản lý đã duyệt"), autoCount: ns.autoCount + 1 }
        : pushFeed(ns, q.agent, `Từ chối: ${q.text}`, "Từ chối");
    }
    case "setSettings":
      return addAudit(
        { ...s, settings: { ...s.settings, ...a.patch } },
        a.actor,
        a.label,
        "Cài đặt",
        a.detail ?? "",
      );
    case "audit":
      return addAudit(s, a.actor, a.action, a.entity, a.detail);

    case "createLead": {
      const market = a.market;
      const p = normalizePhone(a.phoneRaw, market === "KR" ? "KR" : "VN");
      const e164 = p.valid ? p.e164 : null;
      const decision = e164 ? intakeDecision(s, e164) : ({ action: "new_contact" } as IntakeDecision);
      if (decision.action === "attach_open") {
        const o = s.opps.find((x) => x.id === decision.leadId)!;
        let ns = addActivity(
          s,
          o.id,
          "info",
          `Lead mới từ ${a.source} trùng số, đã nối vào lead này${a.note ? `: ${a.note}` : ""}`,
          a.actor,
        );
        if (o.owner)
          ns = addTask(ns, {
            type: "callback",
            title: `${o.name} vừa để lại thông tin lần nữa qua ${a.source}`,
            oppId: o.id,
            owner: o.owner,
            due: s.minutes + s.settings.slaMinutes,
            priority: "high",
            source: "rule",
          });
        return { ...ns, oppSel: o.id };
      }
      if (decision.action === "attach_recent_lost") {
        const c = s.closedLeads.find((x) => x.id === decision.leadId)!;
        return addTask(
          addAudit(
            s,
            a.actor,
            "Gộp lead",
            c.name,
            `Lead mới từ ${a.source} trùng khách vừa thất bại ${Math.round((s.minutes - c.closedAt) / 1440)} ngày trước (${c.reason})`,
          ),
          {
            type: "reactivation",
            title: `${c.name} quay lại qua ${a.source} sau khi thất bại vì "${c.reason}", xem xét mở lại`,
            owner: c.owner,
            due: s.minutes + 60,
            priority: "high",
            source: "rule",
          },
        );
      }
      const inferred =
        market !== "unknown"
          ? market
          : p.valid && p.country === "KR"
            ? "KR"
            : p.valid && p.country === "VN"
              ? "VN"
              : "unknown";
      const seq = s.seq + 1;
      const id = `o${seq + 200}`;
      const price = PRODUCT_VALUE.find(([k]) => a.product.includes(k))?.[1] ?? 0;
      const opp: Opportunity = {
        id,
        name: a.name,
        city: "",
        to: "",
        product: a.product,
        value: price,
        stage: 0,
        source: a.source,
        owner: "",
        score: 50,
        occasion: "",
        next: "Gọi trong 5 phút, hỏi đủ 4 thông tin: mua cho ai, tỉnh người nhận, dịp, ngân sách.",
      };
      const info: LeadInfo = {
        ...newLeadInfo(inferred === "KR" ? "KR" : "VN"),
        buyerPhone: e164 ?? a.phoneRaw,
        buyerPhoneMasked: e164 ? maskPhone(e164) : `${a.phoneRaw} (sai)`,
        tags: a.source.includes("Giới thiệu") ? ["referral"] : [],
      };
      let ns: State = {
        ...s,
        seq,
        opps: [opp, ...s.opps],
        oppSel: id,
        leadInfo: { ...s.leadInfo, [id]: info },
        leadMeta: { ...s.leadMeta, [id]: { phoneE164: e164, phoneInvalid: !e164, createdAt: s.minutes } },
      };
      ns = addActivity(
        ns,
        id,
        "info",
        `Lead tạo tay từ ${a.source}${decision.action === "new_lead" ? " (khách cũ, tạo lead mới)" : ""}${a.note ? `: ${a.note}` : ""}`,
        a.actor,
      );
      if (!e164)
        ns = addTask(ns, {
          type: "data_fix",
          title: `Số của lead ${a.name} không hợp lệ (${a.phoneRaw}), cần kiểm tra`,
          oppId: id,
          owner: "",
          due: s.minutes + 120,
          priority: "normal",
          source: "rule",
          ruleKey: "phone_invalid",
        });
      ns = pushFeed(ns, "lead", `Lead mới ${a.name} từ ${a.source}`, "Đã nhận");
      return routeOpp(ns, id);
    }
    case "assignLead": {
      const o = s.opps.find((x) => x.id === a.oppId);
      if (!o || o.owner === a.to) return s;
      const meta = s.leadMeta[o.id];
      let ns: State = {
        ...s,
        opps: s.opps.map((x) => (x.id === o.id ? { ...x, owner: a.to } : x)),
        tasks: s.tasks.map((t) => (t.oppId === o.id && t.status === "open" ? { ...t, owner: a.to } : t)),
      };
      if (meta && meta.firstContactAt === undefined)
        ns = {
          ...ns,
          leadMeta: {
            ...ns.leadMeta,
            [o.id]: {
              ...meta,
              windowUntil: undefined,
              assignedAt: s.minutes,
              slaDue: a.to ? s.minutes + s.settings.slaMinutes : undefined,
            },
          },
        };
      return addActivity(
        ns,
        o.id,
        "info",
        a.to ? `${o.owner ? `Chuyển từ ${o.owner} sang` : "Giao cho"} ${a.to}` : "Chuyển về hàng Chưa phân",
        a.actor,
      );
    }
    case "toggleDuty": {
      const ns = {
        ...s,
        receivers: s.receivers.map((r) => (r.name === a.name ? { ...r, onDuty: !r.onDuty } : r)),
      };
      const on = ns.receivers.find((r) => r.name === a.name)?.onDuty;
      // Có người vào trực thì lead đang nằm ở hàng Chưa phân (không chờ khung) được chia lại.
      if (!on) return ns;
      return ns.opps
        .filter(
          (o) =>
            !o.owner && o.stage === 0 && ns.leadMeta[o.id] && ns.leadMeta[o.id].windowUntil === undefined,
        )
        .reduce((acc, o) => routeOpp(acc, o.id), ns);
    }
    case "createStockDoc": {
      const seq = s.seq + 1;
      const prefix = { receipt: "PN", issue: "PX", transfer: "PC", count: "KK" }[a.kind];
      const doc: StockDoc = {
        id: `${prefix}-${String(seq).padStart(3, "0")}`,
        kind: a.kind,
        warehouseId: a.warehouseId,
        toWarehouseId: a.toWarehouseId,
        reason: a.reason,
        lines: a.lines,
        status: "draft",
        createdBy: a.actor,
        time: fmtMinutes(s.minutes),
        errors: [],
      };
      return { ...s, seq, stockDocs: [doc, ...s.stockDocs] };
    }
    case "postStockDoc": {
      const doc = s.stockDocs.find((d) => d.id === a.id);
      if (!doc || doc.status !== "draft") return s;
      const plan = planDocument(s.stock, doc);
      if (plan.errors.length) {
        // Thông báo lỗi dùng tên sản phẩm thay cho mã SKU nội bộ.
        const errors = plan.errors.map((e) =>
          VARIANTS.reduce((t, v) => t.replaceAll(v.id, variantLabel(v.id)), e),
        );
        return { ...s, stockDocs: s.stockDocs.map((d) => (d.id === doc.id ? { ...d, errors } : d)) };
      }
      if (plan.needsApproval) {
        const seq = s.seq + 1;
        return {
          ...s,
          seq,
          stockDocs: s.stockDocs.map((d) =>
            d.id === doc.id ? { ...d, status: "pending_approval", errors: [], planned: plan.movements } : d,
          ),
          queue: [
            {
              id: `qs${seq}`,
              kind: "stock_count",
              agent: "trust",
              text: `Phiếu kiểm kê ${doc.id}: ${plan.movements.map((m) => `${m.type === "adjust_plus" ? "+" : "−"}${m.qty} ${variantLabel(m.variantId)}`).join(", ")}`,
              why: "Chênh lệch kiểm kê cần người có quyền duyệt trước khi ghi sổ",
              okText: `Đã duyệt và ghi sổ phiếu ${doc.id}`,
              time: fmtMinutes(s.minutes),
              perm: "inventory.count_approve",
              requestedBy: a.actor,
              ref: doc.id,
            },
            ...s.queue,
          ],
        };
      }
      return postMovements(s, doc, plan.movements, a.actor);
    }
    case "orderPayment": {
      const o = s.orders.find((x) => x.id === a.orderId);
      if (!o) return s;
      const seq = s.seq + 1;
      const idx = o.payments.length;
      const pay = {
        type: a.payType,
        method: a.method,
        amount: a.amount,
        reference: a.reference,
        status: "recorded" as const,
        recordedBy: a.actorId,
        at: simDate(s.minutes).toISOString(),
      };
      return {
        ...s,
        seq,
        orders: s.orders.map((x) => (x.id === o.id ? { ...x, payments: [...x.payments, pay] } : x)),
        queue: [
          {
            id: `qo${seq}`,
            kind: "order_payment",
            agent: "trust",
            text: `Khoản ${a.payType === "deposit" ? "cọc" : "thanh toán"} ${vnd(a.amount)} của đơn ${o.code}, ${a.method}${a.reference ? `, nội dung "${a.reference}"` : ""}`,
            why: "Xác nhận tiền đã về tài khoản",
            okText: `Đã xác nhận ${vnd(a.amount)} cho đơn ${o.code}`,
            time: fmtMinutes(s.minutes),
            perm: "payment.confirm",
            requestedBy: a.actor,
            ref: `${o.id}#${idx}`,
          },
          ...s.queue,
        ],
      };
    }
    case "orderAdvance": {
      const o = s.orders.find((x) => x.id === a.orderId);
      const to = o && NEXT_STATUS[o.status];
      if (!o || !to || transitionBlockers(orderFacts(o), to).length) return s;
      if (to === "deposit_paid" && stockBlockers(s, o).length) return s;
      let ns: State = { ...s, orders: s.orders.map((x) => (x.id === o.id ? { ...x, status: to } : x)) };
      if (to === "deposit_paid") {
        // Đã cọc thì giữ hàng cho từng dòng; quá hạn giữ mà chưa thanh toán đủ thì nhả (CLAUDE.md 8.3).
        let stock = ns.stock;
        // Đặt trước: chỉ giữ phần đang có, phần thiếu chờ hàng về.
        for (const l of o.lines) {
          const avail = levelOf(stock, l.variantId, o.warehouseId);
          const qty = Math.min(l.qty, Math.max(0, avail.onHand - avail.reserved));
          if (qty > 0) stock = reserve(stock, l.variantId, o.warehouseId, qty);
        }
        const hold = new Date(simDate(s.minutes).getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
        ns = { ...ns, stock, orders: ns.orders.map((x) => (x.id === o.id ? { ...x, holdUntil: hold } : x)) };
      }
      if (to === "completed") ns = completeOrder(ns, { ...o, status: to });
      return addAudit(ns, a.actor, "Chuyển trạng thái đơn", o.code, `Sang ${to}`);
    }
    case "orderIssueStock": {
      // Phiếu xuất kho giao hàng: chuyển hàng đang giữ thành xuất bán và gán serial cho hàng có serial.
      const o = s.orders.find((x) => x.id === a.orderId);
      if (!o || o.stockIssued || o.status !== "ready_to_ship") return s;
      let stock = s.stock;
      for (const l of o.lines) stock = reserve(stock, l.variantId, o.warehouseId, -l.qty);
      const doc: StockDoc = {
        id: `PX-${o.code}`,
        kind: "issue",
        warehouseId: o.warehouseId,
        reason: `Xuất giao đơn ${o.code}`,
        lines: o.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
        status: "draft",
        createdBy: a.actor,
        time: fmtMinutes(s.minutes),
        errors: [],
      };
      const plan = planDocument(stock, doc);
      if (plan.errors.length) return s;
      let ns = postMovements({ ...s, stock, stockDocs: [doc, ...s.stockDocs] }, doc, plan.movements, a.actor);
      const lines = o.lines.map((l, i) =>
        needsSerial(l.variantId) && !l.serial
          ? {
              ...l,
              serial: `${variantSku(l.variantId).split("-")[0].replace("DV", "")}-2610-${String(ns.seq + i).padStart(4, "0")}`,
            }
          : l,
      );
      ns = {
        ...ns,
        orders: ns.orders.map((x) =>
          x.id === o.id ? { ...x, lines, stockIssued: true, holdUntil: null } : x,
        ),
      };
      return ns;
    }
    case "orderWarehouse": {
      const o = s.orders.find((x) => x.id === a.orderId);
      if (!o || !["draft", "confirmed", "pending_approval"].includes(o.status)) return s;
      return addAudit(
        { ...s, orders: s.orders.map((x) => (x.id === o.id ? { ...x, warehouseId: a.warehouseId } : x)) },
        a.actor,
        "Đổi kho xuất",
        o.code,
        a.warehouseId,
      );
    }
    case "orderBackorder":
      return addAudit(
        {
          ...s,
          orders: s.orders.map((x) =>
            x.id === a.orderId ? { ...x, backorder: { expected: a.expected } } : x,
          ),
        },
        a.actor,
        "Cho đặt trước, chờ hàng về",
        s.orders.find((x) => x.id === a.orderId)?.code ?? a.orderId,
        `Dự kiến có hàng ${a.expected}`,
      );
    case "consentChange": {
      const care = careOf(s, a.customerId);
      const now = simDate(s.minutes).toISOString();
      const same = (c: Consent) => c.purpose === a.consent.purpose && c.channel === a.consent.channel;
      const consents = care.consents.some(same)
        ? care.consents.map((c) =>
            same(c)
              ? {
                  ...c,
                  granted: !a.withdraw,
                  withdrawnAt: a.withdraw ? now : null,
                  grantedAt: a.withdraw ? c.grantedAt : now,
                }
              : c,
          )
        : [
            ...care.consents,
            { ...a.consent, granted: !a.withdraw, withdrawnAt: a.withdraw ? now : null, grantedAt: now },
          ];
      const name = CUSTOMERS.find((c) => c.id === a.customerId)?.fullName ?? a.customerId;
      const label = `${a.withdraw ? "Rút" : "Ghi nhận"} đồng ý ${a.consent.purpose}/${a.consent.channel}`;
      return addAudit(
        {
          ...s,
          customerCare: {
            ...s.customerCare,
            [a.customerId]: {
              ...care,
              consents,
              events: [
                { at: now, kind: "note", title: label, detail: `Nguồn: ${a.consent.source}` },
                ...care.events,
              ],
            },
          },
        },
        a.actor,
        "Đổi đồng ý",
        `Khách ${name}`,
        label,
      );
    }
    case "customerEvent": {
      const care = careOf(s, a.customerId);
      return {
        ...s,
        customerCare: {
          ...s.customerCare,
          [a.customerId]: {
            ...care,
            events: [
              { at: simDate(s.minutes).toISOString(), kind: a.kind, title: a.title, detail: a.detail },
              ...care.events,
            ],
          },
        },
      };
    }
    case "customerAnonymize": {
      // Yêu cầu xóa: ẩn danh hóa thông tin cá nhân, giữ chứng từ đơn, sổ kho theo luật kế toán, rút mọi đồng ý.
      const care = careOf(s, a.customerId);
      const now = simDate(s.minutes).toISOString();
      return addAudit(
        {
          ...s,
          customerCare: {
            ...s.customerCare,
            [a.customerId]: {
              ...care,
              anonymized: true,
              consents: [
                ...care.consents.map((c) => ({ ...c, granted: false, withdrawnAt: now })),
                { purpose: "care", channel: "all", granted: false, source: "Yêu cầu xóa", withdrawnAt: now },
              ],
            },
          },
        },
        a.actor,
        "Ẩn danh hóa khách theo yêu cầu xóa",
        `Khách ${a.customerId}`,
        "Giữ chứng từ đơn hàng, thanh toán theo luật kế toán",
      );
    }
    case "setTarget":
      return addAudit(
        { ...s, targets: { ...s.targets, [a.staffId]: { revenue: a.revenue, calls: a.calls } } },
        a.actor,
        "Đặt chỉ tiêu",
        staffShort(a.staffId),
        `Doanh thu cọc ${vnd(a.revenue)}, ${a.calls} cuộc gọi mỗi ngày`,
      );
    case "addAbsence": {
      const seq = s.seq + 1;
      const name = staffShort(a.staffId);
      // Ngày nghỉ hôm nay thì không phân lead cho người đó (CLAUDE.md mục 7).
      const today = a.date === "2026-10-04";
      return addAudit(
        {
          ...s,
          seq,
          absences: [
            { id: `ab${seq}`, staffId: a.staffId, date: a.date, kind: a.kind, approvedBy: a.actor },
            ...s.absences,
          ],
          receivers: today
            ? s.receivers.map((r) => (r.name === name ? { ...r, absent: true } : r))
            : s.receivers,
        },
        a.actor,
        "Duyệt nghỉ",
        name,
        `${a.kind} ${a.date.split("-").reverse().join("/")}`,
      );
    }
    case "addCoaching": {
      const seq = s.seq + 1;
      return { ...s, seq, coaching: [{ ...a.note, id: `cn${seq}` }, ...s.coaching] };
    }
    case "shareCoaching":
      return { ...s, coaching: s.coaching.map((n) => (n.id === a.id ? { ...n, shared: a.shared } : n)) };
    case "offboardLock": {
      // Bước 1 bàn giao: khóa và thu hồi phiên, lead và việc đang mở về hàng chung ngay (CLAUDE.md 9.7, mục 5).
      const name = staffShort(a.staffId);
      if (s.offboarded.includes(a.staffId)) return s;
      let ns: State = {
        ...s,
        offboarded: [...s.offboarded, a.staffId],
        receivers: s.receivers.map((r) => (r.name === name ? { ...r, active: false, onDuty: false } : r)),
        opps: s.opps.map((o) => (o.owner === name && o.stage < 5 ? { ...o, owner: "" } : o)),
        tasks: s.tasks.map((t) =>
          t.owner === name && t.status === "open" ? { ...t, owner: "", outcome: "Bàn giao" } : t,
        ),
      };
      for (const o of s.opps.filter((x) => x.owner === name && x.stage < 5))
        ns = addActivity(ns, o.id, "info", `Bàn giao: ${name} nghỉ việc, lead về hàng Chưa phân`, a.actor);
      return addAudit(
        ns,
        a.actor,
        "Khóa tài khoản nghỉ việc",
        name,
        "Thu hồi phiên, chuyển lead và việc về hàng chung",
      );
    }
    case "offboardTransfer": {
      const name = staffShort(a.staffId);
      if (!a.to.length) return s;
      let i = 0;
      let ns = s;
      // Chia vòng tròn cho những người nhận được chọn; lead đã về hàng chung ở bước khóa.
      const pending = s.opps.filter(
        (o) => !o.owner && s.activities.some((x) => x.oppId === o.id && x.text.includes(`Bàn giao: ${name}`)),
      );
      for (const o of pending) {
        const to = a.to[i++ % a.to.length];
        ns = {
          ...ns,
          opps: ns.opps.map((x) => (x.id === o.id ? { ...x, owner: to } : x)),
          tasks: ns.tasks.map((t) => (t.oppId === o.id && t.status === "open" ? { ...t, owner: to } : t)),
        };
        ns = addActivity(ns, o.id, "info", `Bàn giao do nghỉ việc: ${name} → ${to}`, a.actor);
      }
      const orphan = ns.tasks.filter(
        (t) => t.owner === "" && t.outcome === "Bàn giao" && t.status === "open",
      );
      ns = {
        ...ns,
        tasks: ns.tasks.map((t) =>
          orphan.includes(t) ? { ...t, owner: a.to[i++ % a.to.length], outcome: undefined } : t,
        ),
      };
      return addAudit(
        ns,
        a.actor,
        "Bàn giao do nghỉ việc",
        name,
        `${pending.length} lead, ${orphan.length} việc chia cho ${a.to.join(", ")}`,
      );
    }
    case "orderCod":
      return addAudit(
        { ...s, orders: s.orders.map((x) => (x.id === a.orderId ? { ...x, codApproved: true } : x)) },
        a.actor,
        "Duyệt thu khi giao",
        s.orders.find((x) => x.id === a.orderId)?.code ?? a.orderId,
        "",
      );
    case "orderCancel": {
      const o = s.orders.find((x) => x.id === a.orderId);
      if (!o || transitionBlockers(orderFacts(o), "cancelled").length) return s;
      let stock = s.stock;
      // Hủy đơn nhả đúng số hàng đang giữ (hàng đã xuất kho thì cần phiếu nhập trả, không tự cộng lại).
      if ((o.status === "deposit_paid" || o.status === "ready_to_ship") && !o.stockIssued)
        for (const l of o.lines) stock = reserve(stock, l.variantId, o.warehouseId, -l.qty);
      return addAudit(
        {
          ...s,
          stock,
          orders: s.orders.map((x) =>
            x.id === o.id ? { ...x, status: "cancelled", cancelReason: a.reason, holdUntil: null } : x,
          ),
        },
        a.actor,
        "Hủy đơn",
        o.code,
        a.reason,
      );
    }
    case "importLeads": {
      let ns = s;
      let created = 0;
      let dup = 0;
      for (const r of a.rows) {
        if (r.status === "ok") {
          const seq = ns.seq + 1;
          const id = `o${seq + 200}`;
          const owner = ns.receivers.some((x) => x.name === r.previousOwner) ? r.previousOwner : "";
          ns = {
            ...ns,
            seq,
            opps: [
              {
                id,
                name: r.name,
                city: "",
                to: r.province,
                product: r.product || "Chưa rõ",
                value: PRODUCT_VALUE.find(([k]) => r.product.includes(k))?.[1] ?? 0,
                stage: r.lastContact ? 1 : 0,
                source: "Dữ liệu cũ nhập lại",
                owner,
                score: 40,
                occasion: "",
                next: "Lead cũ: làm nóng lại bằng video khách thật cùng tỉnh trước khi gọi.",
              },
              ...ns.opps,
            ],
            leadInfo: {
              ...ns.leadInfo,
              [id]: {
                ...newLeadInfo(r.country === "KR" ? "KR" : "VN"),
                buyerPhone: r.e164!,
                buyerPhoneMasked: maskPhone(r.e164!),
                recipientProvince: r.province,
              },
            },
            leadMeta: {
              ...ns.leadMeta,
              [id]: {
                phoneE164: r.e164,
                createdAt: ns.minutes,
                firstContactAt: r.lastContact ? -1 : undefined,
              },
            },
          };
          ns = addActivity(
            ns,
            id,
            "info",
            `Nhập từ dữ liệu cũ (dòng ${r.line})${r.note ? `: ${r.note}` : ""}`,
            a.actor,
          );
          created++;
        } else if (r.status === "duplicate_existing" && a.duplicateMode !== "skip" && r.e164) {
          const d = intakeDecision(ns, r.e164);
          if (d.action === "attach_open") {
            dup++;
            if (a.duplicateMode === "update" && r.province) {
              const info = ns.leadInfo[d.leadId];
              if (info && !info.recipientProvince)
                ns = {
                  ...ns,
                  leadInfo: { ...ns.leadInfo, [d.leadId]: { ...info, recipientProvince: r.province } },
                };
            }
            ns = addActivity(
              ns,
              d.leadId,
              "info",
              `Dữ liệu cũ (dòng ${r.line}): ${r.note || "trùng số, không tạo lead mới"}`,
              a.actor,
            );
          }
        }
      }
      return addAudit(
        ns,
        a.actor,
        "Nhập file lead",
        "Dữ liệu cũ",
        `${created} lead mới, ${dup} dòng trùng đã ${a.duplicateMode === "update" ? "cập nhật" : "ghi hoạt động"}`,
      );
    }
  }
}

const variantLabel = (id: string) => {
  const v = VARIANTS.find((x) => x.id === id);
  const p = PRODUCTS.find((x) => x.id === v?.productId);
  return p ? `${p.name}${v && v.name !== "Tiêu chuẩn" ? ` ${v.name.toLowerCase()}` : ""}` : id;
};
const variantSku = (id: string) => VARIANTS.find((x) => x.id === id)?.sku ?? id;
const needsSerial = (id: string) =>
  PRODUCTS.find((p) => p.id === VARIANTS.find((v) => v.id === id)?.productId)?.trackSerial ?? false;

export function orderMoney(o: Order) {
  const subtotal = o.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const discount = o.lines.reduce((s, l) => s + l.discount, 0);
  const total = subtotal - discount + o.fees.delivery + o.fees.installation;
  const confirmed = o.payments
    .filter((p) => p.status === "confirmed" && p.type !== "refund")
    .reduce((s, p) => s + p.amount, 0);
  const pending = o.payments.filter((p) => p.status === "recorded").reduce((s, p) => s + p.amount, 0);
  return {
    subtotal,
    discount,
    fees: o.fees.delivery + o.fees.installation,
    total,
    confirmed,
    pending,
    balance: total - confirmed,
  };
}

export function orderFacts(o: OrderRec): OrderFacts {
  const m = orderMoney(o);
  return {
    status: o.status as OrderStatus,
    hasRecipient: Boolean(o.recipientId),
    hasAddress: Boolean(o.address.trim()),
    total: m.total,
    confirmedPaid: m.confirmed,
    // Chính sách cọc đang áp: tối thiểu 10 triệu hoặc 10%, không quá tổng.
    depositMinimum: Math.min(m.total, Math.max(10_000_000, Math.round(m.total / 10))),
    codApproved: o.codApproved,
    stockIssued: o.stockIssued,
    serialsAssigned: o.lines.every((l) => !needsSerial(l.variantId) || Boolean(l.serial)),
  };
}

/** Tên gọi ngắn của nhân sự, khớp cột "người phụ trách" của dữ liệu mô phỏng. */
export function staffShort(id: string): string {
  const st = STAFF.find((x) => x.id === id);
  if (!st) return id;
  return st.roleKey === "owner" || st.roleKey === "sale_admin"
    ? st.fullName.split(" ")[0]
    : st.fullName.split(" ").pop()!;
}

export function careOf(s: State, customerId: string): CustomerCare {
  const existing = s.customerCare[customerId];
  if (existing) return existing;
  const c = CUSTOMERS.find((x) => x.id === customerId);
  return { consents: c ? fromChannelList(c.consents, c.source) : [], events: [] };
}

/** Thiếu hàng khả dụng để giữ cho đơn (không bán âm, CLAUDE.md 8.3); đơn đặt trước thì không chặn. */
export function stockBlockers(s: State, o: OrderRec): string[] {
  if (o.backorder) return [];
  const need = new Map<string, number>();
  for (const l of o.lines) need.set(l.variantId, (need.get(l.variantId) ?? 0) + l.qty);
  return [...need]
    .filter(([v, q]) => {
      const l = levelOf(s.stock, v, o.warehouseId);
      return l.onHand - l.reserved < q;
    })
    .map(([v, q]) => {
      const l = levelOf(s.stock, v, o.warehouseId);
      return `Không đủ hàng khả dụng ${variantLabel(v)} ở kho đã chọn: cần ${q}, còn ${Math.max(0, l.onHand - l.reserved)}`;
    });
}

/** Lý do chưa xuất kho được cho đơn (hàng đặt trước chưa về đủ). */
export function issueBlockers(s: State, o: OrderRec): string[] {
  let stock = s.stock;
  for (const l of o.lines) stock = reserve(stock, l.variantId, o.warehouseId, -l.qty);
  const errors = planDocument(stock, {
    id: "check",
    kind: "issue",
    warehouseId: o.warehouseId,
    reason: "",
    lines: o.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
  }).errors;
  return errors.map((e) => VARIANTS.reduce((t, v) => t.replaceAll(v.id, variantLabel(v.id)), e));
}

function postMovements(s: State, doc: StockDoc, movements: Movement[], actor: string): State {
  const seq = s.seq + movements.length;
  const rows: LedgerRow[] = movements.map((m, i) => ({
    ...m,
    id: `sm${s.seq + i + 1}`,
    time: fmtMinutes(s.minutes),
    actor,
  }));
  return addAudit(
    {
      ...s,
      seq,
      stock: applyMovements(s.stock, movements),
      ledger: [...rows, ...s.ledger],
      stockDocs: s.stockDocs.map((d) => (d.id === doc.id ? { ...d, status: "posted", errors: [] } : d)),
    },
    actor,
    "Ghi sổ phiếu kho",
    doc.id,
    movements.map((m) => `${m.type} ${m.qty} ${variantSku(m.variantId)}`).join(", "),
  );
}

function completeOrder(s: State, o: OrderRec): State {
  // Hoàn tất sinh phiếu bảo hành cho từng serial và việc chăm sóc theo luật (CLAUDE.md 8.7).
  const start = simDate(s.minutes);
  const warranties: Warranty[] = o.lines
    .filter((l) => l.serial)
    .map((l, i) => {
      const p = PRODUCTS.find((x) => x.id === VARIANTS.find((v) => v.id === l.variantId)?.productId)!;
      const end = new Date(start);
      end.setMonth(end.getMonth() + p.warrantyMonths);
      return {
        id: `BH-${o.code}-${i + 1}`,
        orderId: o.id,
        orderCode: o.code,
        product: p.name,
        serial: l.serial!,
        owner: o.recipientId,
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      };
    });
  let ns: State = { ...s, warranties: [...warranties, ...s.warranties] };
  const rules = new Set(s.settings.taskRules.filter((r) => r.active).map((r) => r.key));
  if (rules.has("post_delivery_3d"))
    ns = addTask(ns, {
      type: "post_delivery_call",
      title: `Gọi hỏi thăm sau giao đơn ${o.code}`,
      owner: "",
      due: s.minutes + 3 * 1440,
      priority: "normal",
      source: "rule",
      ruleKey: "post_delivery_3d",
    });
  if (rules.has("consumable_cycle") && o.lines.some((l) => ["v-ion", "v-ro"].includes(l.variantId)))
    ns = addTask(ns, {
      type: "consumable_reminder",
      title: `Nhắc thay lõi lọc cho đơn ${o.code}`,
      owner: "",
      due: s.minutes + 180 * 1440,
      priority: "normal",
      source: "rule",
      ruleKey: "consumable_cycle",
    });
  return ns;
}

const PRODUCT_VALUE: [string, number][] = [
  ["DV-X9", 79.9],
  ["DV-S7", 49.9],
  ["DV-M5", 29.9],
  ["lọc nước", 16.9],
];

/** Thị trường của khách sang khung gọi; thị trường chưa rõ thì không chờ khung. */
export function marketWindows(s: State, market: string): MarketWindows | null {
  const m = s.settings.markets.find((x) => x.code === market && x.active);
  return m ? weeklyWindows(m.timezone, m.weekday, m.weekend) : null;
}

/** Quyết định chống trùng cho một số điện thoại đã chuẩn hóa, theo dữ liệu đang có. */
export function intakeDecision(s: State, e164: string): IntakeDecision {
  const contacts: KnownContact[] = [
    ...s.opps.map((o) => ({
      id: o.id,
      identities: s.leadMeta[o.id]?.phoneE164
        ? [{ type: "phone" as const, value: s.leadMeta[o.id].phoneE164! }]
        : [],
    })),
    ...s.closedLeads.map((c) => ({ id: c.id, identities: [{ type: "phone" as const, value: c.phoneE164 }] })),
  ];
  const leads: KnownLead[] = [
    ...s.opps.map((o) => ({ id: o.id, contactId: o.id, stage: "contacted" as const })),
    ...s.closedLeads.map((c) => ({
      id: c.id,
      contactId: c.id,
      stage: c.stage,
      closedAt: simDate(c.closedAt),
    })),
  ];
  return decideIntake([{ type: "phone", value: e164 }], simDate(s.minutes), contacts, leads);
}

function receiversOf(s: State): Receiver[] {
  return s.receivers.map((r) => ({
    id: r.name,
    canReceive: r.canReceive,
    active: r.active,
    onDuty: r.onDuty,
    absent: r.absent,
    uncontacted: s.opps.filter(
      (o) =>
        o.owner === r.name &&
        o.stage === 0 &&
        s.leadMeta[o.id] &&
        s.leadMeta[o.id].firstContactAt === undefined,
    ).length,
  }));
}

const fromDate = (d: Date) => Math.round((d.getTime() - simDate(0).getTime()) / 60_000);

/** Chạy luật phân lead cho một cơ hội đang chưa có người giữ. */
function routeOpp(s: State, oppId: string): State {
  const o = s.opps.find((x) => x.id === oppId);
  if (!o) return s;
  const info = s.leadInfo[oppId];
  const r = routeLead({
    at: simDate(s.minutes),
    market: info ? marketWindows(s, info.market) : null,
    receivers: receiversOf(s),
    lastAssignedId: s.lastAssigned,
    maxUncontacted: s.settings.maxUncontacted,
    slaMinutes: s.settings.slaMinutes,
  });
  const meta = s.leadMeta[oppId];
  if (r.kind === "wait") {
    const until = fromDate(r.until);
    return addActivity(
      { ...s, leadMeta: { ...s.leadMeta, [oppId]: { ...meta, windowUntil: until } } },
      oppId,
      "info",
      `Ngoài khung gọi của khách, chờ tới ${fmtDue(until)} (giờ VN) mới giao`,
      "Hệ thống",
    );
  }
  if (r.kind === "unassigned")
    return addActivity(
      { ...s, leadMeta: { ...s.leadMeta, [oppId]: { ...meta, windowUntil: undefined } } },
      oppId,
      "info",
      "Không có telesale đang trực, lead vào hàng Chưa phân",
      "Hệ thống",
    );
  const slaDue = fromDate(r.slaDueAt);
  let ns: State = {
    ...s,
    lastAssigned: r.assigneeId,
    opps: s.opps.map((x) => (x.id === oppId ? { ...x, owner: r.assigneeId } : x)),
    leadMeta: { ...s.leadMeta, [oppId]: { ...meta, windowUntil: undefined, assignedAt: s.minutes, slaDue } },
  };
  ns = addActivity(
    ns,
    oppId,
    "info",
    `Phân vòng tròn cho ${r.assigneeId}, hạn liên hệ ${fmtMinutes(slaDue)}`,
    "Hệ thống",
  );
  return addTask(ns, {
    type: "first_contact",
    title: `Gọi lead mới ${o.name} (${o.source})`,
    oppId,
    owner: r.assigneeId,
    due: slaDue,
    priority: "high",
    source: "rule",
    ruleKey: "lead_new_sla",
  });
}

/** Việc nền mô phỏng: lead đang chờ khung gọi được giao khi tới đầu khung. */
function releaseWaiting(s: State): State {
  return s.opps
    .filter(
      (o) =>
        !o.owner && s.leadMeta[o.id]?.windowUntil !== undefined && s.leadMeta[o.id].windowUntil! <= s.minutes,
    )
    .reduce((acc, o) => routeOpp(acc, o.id), s);
}

const INFO_LABEL: Record<string, string> = {
  buyFor: "mua cho ai",
  recipientName: "tên người nhận",
  recipientRelation: "quan hệ",
  recipientProvince: "tỉnh người nhận",
  occasion: "dịp",
  occasionDate: "ngày dịp",
  budget: "ngân sách",
  market: "thị trường",
};

export const vnd = (v: number) => `${new Intl.NumberFormat("vi-VN").format(v)}đ`;

function setStage(s: State, oppId: string, stage: number): State {
  return { ...s, opps: s.opps.map((o) => (o.id === oppId ? { ...o, stage: Math.max(o.stage, stage) } : o)) };
}

function addActivity(s: State, oppId: string, kind: Activity["kind"], text: string, actor: string): State {
  const seq = s.seq + 1;
  return {
    ...s,
    seq,
    activities: [{ id: `ac${seq}`, oppId, time: fmtMinutes(s.minutes), kind, text, actor }, ...s.activities],
  };
}

function addAudit(s: State, actor: string, action: string, entity: string, detail: string): State {
  const seq = s.seq + 1;
  return {
    ...s,
    seq,
    audit: [
      { id: `au${seq}`, time: `04/10 ${fmtMinutes(s.minutes)}`, actor, action, entity, detail },
      ...s.audit,
    ],
  };
}

function addTask(s: State, t: Omit<Task, "id" | "status">): State {
  const seq = s.seq + 1;
  return { ...s, seq, tasks: [{ ...t, id: `t${seq + 100}`, status: "open" }, ...s.tasks] };
}

function markSent(s: State, quoteId: string, actor: string): State {
  const q = s.quotes.find((x) => x.id === quoteId)!;
  let ns: State = { ...s, quotes: s.quotes.map((x) => (x.id === quoteId ? { ...x, status: "sent" } : x)) };
  ns = setStage(ns, q.oppId, 3);
  return addActivity(
    ns,
    q.oppId,
    "quote",
    `Gửi báo giá ${q.id} (${vnd(q.result.totals.total)}), link /q/${q.token}`,
    actor,
  );
}

function createOrder(s: State, q: QuoteRec, actor: string): State {
  const o = s.opps.find((x) => x.id === q.oppId)!;
  const info = s.leadInfo[o.id] ?? newLeadInfo("VN");
  const n = 1028 + s.deliveries.filter((d) => d.quoteId).length;
  const first = q.result.lines.find((l) => !l.isGift);
  const d: Delivery = {
    id: `DV-${n}`,
    buyer: o.name,
    buyerCity: info.market === "KR" ? o.city : "",
    recipient:
      info.buyFor === "self"
        ? o.name
        : info.recipientName
          ? `${info.recipientName} (${info.recipientRelation.toLowerCase()})`
          : "Chưa xác nhận",
    address: q.province,
    product: first?.name ?? o.product,
    value: Math.round(q.result.totals.total / 100_000) / 10,
    payment: "Chưa thanh toán",
    step: 0,
    eta: "Chờ cọc",
    houseId: o.houseId,
    note: `Sinh từ báo giá ${q.id}. Cọc tối thiểu ${vnd(q.result.deposit.minimum)}, giữ hàng ${q.result.deposit.holdDays} ngày.`,
    flag: info.keepSurprise ? "Giữ bất ngờ: chưa liên hệ người nhận" : null,
    oppId: o.id,
    quoteId: q.id,
    totalVnd: q.result.totals.total,
    depositMin: q.result.deposit.minimum,
    paidVnd: 0,
    hasFilter: q.result.lines.some((l) => l.name.includes("Máy lọc")),
  };
  const ns = { ...s, deliveries: [d, ...s.deliveries], delSel: d.id };
  return addActivity(ns, o.id, "delivery", `Tạo đơn ${d.id} từ báo giá ${q.id}`, actor);
}

function completeDelivery(s: State, d: Delivery): State {
  // Hoàn tất sinh việc chăm sóc theo luật đang bật (CLAUDE.md 8.7, task_rules).
  let ns = s;
  const owner = s.opps.find((o) => o.id === d.oppId)?.owner ?? "Thảo";
  const rules = new Set(s.settings.taskRules.filter((r) => r.active).map((r) => r.key));
  if (rules.has("post_delivery_3d"))
    ns = addTask(ns, {
      type: "post_delivery_call",
      title: `Gọi hỏi thăm ${d.buyer} sau 3 ngày dùng ${d.product}`,
      deliveryId: d.id,
      oppId: d.oppId,
      owner,
      due: s.minutes + 3 * 24 * 60,
      priority: "normal",
      source: "rule",
      ruleKey: "post_delivery_3d",
    });
  if (d.hasFilter && rules.has("consumable_cycle"))
    ns = addTask(ns, {
      type: "consumable_reminder",
      title: `Nhắc thay lõi lọc cho ${d.recipient}`,
      deliveryId: d.id,
      oppId: d.oppId,
      owner: "",
      due: s.minutes + 180 * 24 * 60,
      priority: "normal",
      source: "rule",
      ruleKey: "consumable_cycle",
    });
  if (d.oppId)
    ns = addActivity(
      ns,
      d.oppId,
      "delivery",
      `Đơn ${d.id} hoàn tất, sinh phiếu bảo hành; khách sang "Đang sử dụng"`,
      "Hệ thống",
    );
  return ns;
}

function updateConv(s: State, id: string, f: (c: Conversation) => Conversation): State {
  return { ...s, convs: s.convs.map((c) => (c.id === id ? f(c) : c)) };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface Ctx {
  state: State;
  dispatch: (a: Action) => void;
  /** Gửi hành động và báo toast. */
  act: (a: Action, message?: string) => void;
}

const CrmContext = createContext<Ctx | null>(null);

export function CrmProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const toast = useToast();
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    if (state.paused) return;
    const id = setInterval(() => dispatch({ type: "tick" }), 3200);
    return () => clearInterval(id);
  }, [state.paused]);

  const act = useCallback(
    (a: Action, message?: string) => {
      const before = latest.current;
      dispatch(a);
      if (message) toast(message);
      if (a.type === "reply") {
        const conv = before.convs.find((c) => c.id === before.convSel);
        if (conv?.followUp) {
          // Khách phản hồi sau khi nhân viên trả lời (mô phỏng).
          setTimeout(() => {
            dispatch({ type: "customerFollowUp", convId: conv.id });
            toast("Khách đã đồng ý video call");
          }, 2200);
        }
      }
    },
    [toast],
  );

  const value = useMemo(() => ({ state, dispatch, act }), [state, act]);
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm() {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error("useCrm must be used inside CrmProvider");
  return ctx;
}

export { DELIVERY_STEPS, STAGES, agentById };
export type { State as CrmState };
