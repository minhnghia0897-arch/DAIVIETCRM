"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";

import { useToast } from "@/components/ui/toast";
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
  agent: AgentId;
  text: string;
  why: string;
  okText: string;
  time: string;
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

function approvalEvent(r: Rand): Omit<QueueItem, "id" | "time"> {
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
      queue: [{ ...e, id: `q${seq}`, time }, ...s.queue],
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
  | { type: "advanceOpp" }
  | { type: "loseOpp" }
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
  | { type: "selectTrace"; id: string };

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
      return s.paused ? s : step(s, Math.random);
    case "togglePause":
      return { ...s, paused: !s.paused };
    case "decide": {
      const q = s.queue.find((x) => x.id === a.id);
      if (!q) return s;
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
      const o = s.opps.find((x) => x.id === s.oppSel);
      if (!o || o.stage >= 5) return s;
      const next = { ...o, stage: o.stage + 1 };
      let ns: State = { ...s, opps: s.opps.map((x) => (x.id === o.id ? next : x)) };
      if (next.stage === 4) {
        ns = {
          ...pushFeed(ns, "tele", `${o.name} đặt cọc ${o.product}`, `+${tr(o.value)}`, true),
          revenue: ns.revenue + o.value,
        };
      }
      return ns;
    }
    case "loseOpp": {
      const opps = s.opps.filter((x) => x.id !== s.oppSel);
      return { ...s, opps, oppSel: opps[0]?.id ?? "" };
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
          { ...s, opps: [opp, ...s.opps] },
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
      let ns = s;
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
  }
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
