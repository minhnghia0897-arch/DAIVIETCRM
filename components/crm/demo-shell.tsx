"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo } from "react";

import { ToastProvider, useToast } from "@/components/ui/toast";
import { AI_SUGGESTIONS, aiAnswer } from "@/lib/demo/ai-answers";
import { STAGES, houseById } from "@/lib/demo/crm-data";
import { CUSTOMERS } from "@/lib/demo/data";
import { ORDER_STATUS } from "@/lib/demo/labels";
import { visibleCustomers } from "@/lib/demo/repo";

import { visibleChats, visibleConvs, visibleHouses, visibleOpps, visibleQueue } from "./access";
import { ApprovalList, FeedList } from "./parts-demo";
import type { QuickItem } from "./quick-switcher";
import { ShellFrame, type DemoBits, type ShellProps, type TrailStep } from "./shell";
import { CrmProvider, fmtMinutes, orderPeople, orderRisks, useCrm, visibleOrders } from "./store";
import { slaStats } from "./views/lead-intake";

// Khung của bản demo (layout.demo.tsx) và kho mô phỏng cho các màn chưa nối database trên bản thật: cùng khung
// ShellFrame, cắm thêm đồng hồ giả lập, số đếm, trợ lý AI thử, hàng chờ duyệt, nhật ký agent từ kho mô phỏng.

export function CrmShell(props: ShellProps) {
  const { user } = props;
  const who = useMemo(
    () => ({
      perms: new Set(user.permissions),
      me: user.shortName,
      userId: user.id,
      // Quyền chỉ Owner (không cấp được) dùng để nhận ra Owner, không suy từ tên vai trò.
      isOwner: user.permissions.includes("settings.permissions"),
      readOnly: Boolean(user.readOnly),
    }),
    [user.permissions, user.shortName, user.id, user.readOnly],
  );
  return (
    <ToastProvider>
      <CrmProvider who={who}>
        <DemoUser.Provider value={user}>
          <ShellFrame {...props} useDemo={useDemoBits} />
        </DemoUser.Provider>
      </CrmProvider>
    </ToastProvider>
  );
}

/** Kho mô phỏng cho một màn chưa nối database trên bản thật (nạp riêng, không nằm trong khung). */
export function DemoStore({
  user,
  children,
}: {
  user: { id: string; shortName: string; permissions: string[]; readOnly?: boolean };
  children: React.ReactNode;
}) {
  const who = useMemo(
    () => ({
      perms: new Set(user.permissions),
      me: user.shortName,
      userId: user.id,
      isOwner: user.permissions.includes("settings.permissions"),
      readOnly: Boolean(user.readOnly),
    }),
    [user.permissions, user.shortName, user.id, user.readOnly],
  );
  return <CrmProvider who={who}>{children}</CrmProvider>;
}

const DemoUser = createContext<ShellProps["user"] | null>(null);

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();

function useDemoBits(): DemoBits {
  const { state, act, who } = useCrm();
  const user = useContext(DemoUser)!;
  const toast = useToast();
  const router = useRouter();
  const perms = who.perms;
  const me = who.me;

  const navCounts: Record<string, number> = {
    "/tasks": state.tasks.filter((t) => t.status === "open" && t.owner === me).length,
    "/inbox": visibleConvs(state, who).filter((c) => c.status === "need").length,
    // Tin chưa đọc trong các nhóm nội bộ mình tham gia.
    "/chat": visibleChats(state, who).reduce(
      (n, c) =>
        n +
        c.topics.reduce(
          (k, t) => k + Math.max(0, t.messages.length - (state.chatSeen[`${c.id}/${t.id}`] ?? 0)),
          0,
        ),
      0,
    ),
  };
  const queue = visibleQueue(state, who);
  const sla = slaStats(state);
  const receiver = state.receivers.find((r) => r.name === me);

  function trailLabel(step: TrailStep): string | null {
    const [, root, id] = step.path.split("/");
    if (root === "orders" && id) return `đơn ${state.orders.find((o) => o.id === id)?.code ?? ""}`.trim();
    if (root === "customers" && id)
      return `khách ${CUSTOMERS.find((c) => c.id === id)?.fullName ?? ""}`.trim();
    if (root === "opportunities") {
      const o = state.opps.find((x) => x.id === step.opp);
      return o ? `lead ${o.name}` : "Cơ hội";
    }
    if (root === "households") return houseById(step.house)?.name ?? "Hộ gia đình";
    return null;
  }

  return {
    clock: { vn: fmtMinutes(state.minutes), kr: fmtMinutes(state.minutes + 120), label: "Giờ mô phỏng" },
    navCounts,
    activity: { ...navCounts, "/opportunities": visibleOpps(state, who).filter((o) => o.stage === 0).length },
    duty: receiver ? Boolean(receiver.onDuty) : null,
    toggleDuty: (v) =>
      act(
        { type: "toggleDuty", name: me, actor: me },
        v ? "Đã bật trực, bắt đầu nhận lead" : "Đã tắt trực, không nhận lead mới",
      ),
    trailExtra: () => ({ opp: state.oppSel, house: state.houseSel }),
    trailLabel,
    restore: (prev) => {
      if (prev.path === "/opportunities" && prev.opp) act({ type: "selectOpp", id: prev.opp });
      if (prev.path === "/households" && prev.house) act({ type: "selectHouse", id: prev.house });
    },
    answer: (question, view, path) => {
      // Trợ lý chạy dưới quyền người hỏi: chỉ nhận dữ liệu người đó được xem (CLAUDE.md 10.7).
      const opps = visibleOpps(state, who);
      const houses = visibleHouses(state, who);
      return aiAnswer(question, {
        view,
        revenue: state.revenue,
        minutes: fmtMinutes(state.minutes),
        autoCount: state.autoCount,
        opps,
        oppSel: opps.some((o) => o.id === state.oppSel) ? state.oppSel : (opps[0]?.id ?? ""),
        houseSel: houses.some((h) => h.id === state.houseSel) ? state.houseSel : (houses[0]?.id ?? ""),
        team: perms.has("report.team"),
        orders: visibleOrders(state.orders, perms, user.id).map((o) => {
          const p = orderPeople(o);
          return {
            id: o.id,
            code: o.code,
            buyer: p.buyer,
            recipient: p.self ? p.buyer : p.recipient,
            status: ORDER_STATUS[o.status].label,
            risks: orderRisks(o),
          };
        }),
        orderSel: path.match(/^\/orders\/([^/]+)/)?.[1],
        convs: visibleConvs(state, who),
      });
    },
    suggestions: (view) => AI_SUGGESTIONS[view],
    ctxLine: (view, path) => {
      if (view === "house") return `Đang xem: ${houseById(state.houseSel)?.name}`;
      if (view === "opps")
        return `Đang xem: cơ hội ${state.opps.find((o) => o.id === state.oppSel)?.name ?? ""}`;
      if (view === "orders") {
        const id = path.match(/^\/orders\/([^/]+)/)?.[1];
        const o = id ? state.orders.find((x) => x.id === id) : undefined;
        return o ? `Đang xem: đơn ${o.code}` : "Đang xem: danh sách đơn hàng";
      }
      if (view === "convos")
        return `Đang xem: hội thoại ${state.convs.find((c) => c.id === state.convSel)?.name}`;
      return "Đọc dữ liệu showroom Quận 4 theo quyền của anh chị";
    },
    quickItems: () => {
      const leads: QuickItem[] = visibleOpps(state, who).map((o) => ({
        id: `l${o.id}`,
        label: o.name,
        hint: `${o.product} · ${STAGES[o.stage]}${o.owner ? ` · ${o.owner}` : ""}`,
        group: "Lead" as const,
        run: () => {
          act({ type: "selectOpp", id: o.id });
          router.push("/opportunities");
        },
      }));
      const orders: QuickItem[] = visibleOrders(state.orders, perms, user.id).map((o) => ({
        id: `o${o.id}`,
        label: o.code,
        hint: `${orderPeople(o).buyer} · ${ORDER_STATUS[o.status].label}`,
        group: "Đơn hàng" as const,
        run: () => router.push(`/orders/${o.id}`),
      }));
      const houses: QuickItem[] = visibleHouses(state, who).map((h) => ({
        id: `h${h.id}`,
        label: h.name,
        hint: h.members.map((m) => m.name).join(", "),
        group: "Hộ gia đình" as const,
        run: () => {
          act({ type: "selectHouse", id: h.id });
          router.push("/households");
        },
      }));
      const customers: QuickItem[] = visibleCustomers({ id: user.id, permissions: perms }).map((c) => ({
        id: `c${c.id}`,
        label: c.fullName,
        hint: `Khách · ${c.phoneMasked}`,
        group: "Khách" as const,
        run: () => router.push(`/customers/${c.id}`),
      }));
      return [...leads, ...orders, ...houses, ...customers];
    },
    search: (text) => {
      const t = fold(text);
      const house = visibleHouses(state, who).find(
        (h) => fold(h.name).includes(t) || h.members.some((m) => fold(m.name).includes(t)),
      );
      if (house) {
        act({ type: "selectHouse", id: house.id }, `Mở ${house.name}`);
        router.push("/households");
        return true;
      }
      const d = visibleOrders(state.orders, perms, user.id).find(
        (x) => fold(x.code).includes(t) || fold(orderPeople(x).buyer).includes(t),
      );
      if (d) {
        toast(`Mở đơn ${d.code}`);
        router.push(`/orders/${d.id}`);
        return true;
      }
      return false;
    },
    queueCount: queue.length,
    approvals: <ApprovalList items={queue} />,
    feed: <FeedList items={state.feed} limit={20} />,
    paused: state.paused,
    togglePause: () => act({ type: "togglePause" }, state.paused ? "Agent chạy tiếp" : "Đã tạm dừng agent"),
    sla: { overdue: sla.overdue.length, unassigned: sla.unassigned.length },
    integrationErrors: Object.values(state.settings.integrationStates).filter((x) => x.status === "error")
      .length,
  };
}
