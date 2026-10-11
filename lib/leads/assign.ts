import { isInWindow, nextWindowStart, type MarketWindows } from "./windows";

// Phân lead (CLAUDE.md mục 7): vòng tròn cho người có quyền `lead.receive`, đang hoạt động, đang trực,
// không nghỉ, chưa vượt N lead chưa liên hệ. Lead ngoài khung gọi của thị trường khách thì chờ tới đầu khung.

export interface Receiver {
  id: string;
  canReceive: boolean;
  active: boolean;
  onDuty: boolean;
  absent: boolean;
  /** Số lead đang giữ mà chưa liên hệ (không tính lead đang chờ khung gọi). */
  uncontacted: number;
}

export function isEligible(r: Receiver, maxUncontacted: number): boolean {
  return r.canReceive && r.active && r.onDuty && !r.absent && r.uncontacted < maxUncontacted;
}

/** Người kế tiếp sau `lastAssignedId` trong vòng, bỏ qua người không đủ điều kiện. */
export function pickAssignee(
  receivers: Receiver[],
  lastAssignedId: string | null,
  maxUncontacted: number,
): Receiver | null {
  if (!receivers.length) return null;
  const startIdx = lastAssignedId ? receivers.findIndex((r) => r.id === lastAssignedId) + 1 : 0;
  for (let k = 0; k < receivers.length; k++) {
    const r = receivers[(startIdx + k) % receivers.length];
    if (isEligible(r, maxUncontacted)) return r;
  }
  return null;
}

export type RouteResult =
  | { kind: "assigned"; assigneeId: string; slaDueAt: Date }
  | { kind: "wait"; until: Date }
  | { kind: "unassigned"; reason: string };

export function routeLead(input: {
  at: Date;
  market: MarketWindows | null;
  receivers: Receiver[];
  lastAssignedId: string | null;
  maxUncontacted: number;
  slaMinutes: number;
}): RouteResult {
  if (input.market && !isInWindow(input.at, input.market)) {
    const until = nextWindowStart(input.at, input.market);
    if (until) return { kind: "wait", until };
  }
  const r = pickAssignee(input.receivers, input.lastAssignedId, input.maxUncontacted);
  if (!r) return { kind: "unassigned", reason: "Không có người nhận lead đang trực" };
  return {
    kind: "assigned",
    assigneeId: r.id,
    slaDueAt: new Date(input.at.getTime() + input.slaMinutes * 60_000),
  };
}
