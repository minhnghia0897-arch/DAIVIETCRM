"use client";

import { ChevronRight, Phone, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { STAGES } from "@/lib/demo/crm-data";
import { missingInfo, newLeadInfo } from "@/lib/demo/ops-data";
import { ORDER_STATUS } from "@/lib/demo/labels";
import { revealAllowed, visibleOpps, visibleQueue } from "../access";
import { ApprovalList, LocTag } from "../parts";
import { useShell } from "../shell-context";
import { fmtDue, orderMoney, orderPeople, useCrm, visibleOrders, vnd } from "../store";
import { SlaPill } from "./lead-intake";

// Mini App: giao diện CRM gọn cho điện thoại, mở từ nút "Mở CRM" của bot Telegram (CLAUDE.md 10.3 telegram_bot).
// Một tay làm được việc hằng ngày: việc của tôi, lead của tôi (gọi, ghi kết quả nhanh), đơn của tôi, việc chờ duyệt,
// tìm nhanh. Quyền kiểm như mọi màn khác; muốn đầy đủ thì mở hồ sơ trên CRM.

type Tab = "viec" | "lead" | "don" | "duyet" | "tim";

export function MiniApp({ tab: initialTab, id }: { tab?: string; id?: string }) {
  const { state, act, who } = useCrm();
  const { me, perms, userId } = useShell();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(
    (["viec", "lead", "don", "duyet", "tim"] as Tab[]).find((t) => t === initialTab) ?? "viec",
  );
  const [leadId, setLeadId] = useState<string | undefined>(id);
  const [q, setQ] = useState("");

  const tasks = state.tasks
    .filter((t) => t.status === "open" && t.owner === me)
    .sort((a, b) => a.due - b.due);
  // Lead đang mở trong phạm vi xem (tab Lead chỉ hiện lead mình giữ; Tìm tìm trong cả phạm vi).
  const leads = visibleOpps(state, who).filter((o) => o.stage < 5);
  const myLeads = leads.filter((o) => o.owner === me);
  const orders = visibleOrders(state.orders, perms, userId).filter(
    (o) => !["completed", "cancelled"].includes(o.status),
  );
  const approvals = visibleQueue(state, who).filter((x) => perms.has(x.perm));
  const canApprove = ["order.discount_approve", "payment.confirm", "inventory.count_approve"].some((p) =>
    perms.has(p),
  );

  const tabs: [Tab, string, number][] = [
    ["viec", "Việc", tasks.length],
    ["lead", "Lead", myLeads.length],
    ["don", "Đơn", orders.length],
    ...(canApprove ? ([["duyet", "Duyệt", approvals.length]] as [Tab, string, number][]) : []),
    ["tim", "Tìm", 0],
  ];
  const lead = leadId
    ? state.opps.find((o) => o.id === leadId && leads.some((x) => x.id === o.id))
    : undefined;

  return (
    <div className="ma" aria-label="Mini App">
      <header className="ma-head">
        <b>Chào {me}</b>
        <span className="c-lbl">
          {tasks.length} việc · {myLeads.length} lead đang giữ
        </span>
      </header>
      <nav className="ma-tabs" role="tablist" aria-label="Mini App">
        {tabs.map(([k, l, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
              setLeadId(undefined);
            }}
          >
            {l}
            {n ? <span className="tg-badge">{n}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "viec" ? (
        <ul className="ma-list">
          {tasks.length === 0 ? <li className="c-empty">Hết việc. Việc mới sẽ báo qua Telegram.</li> : null}
          {tasks.map((t) => (
            <li key={t.id} className="ma-card">
              <b>{t.title}</b>
              <span className={`c-lbl ${t.due < state.minutes ? "text-err" : ""}`}>{fmtDue(t.due)}</span>
              <div className="ma-acts">
                <button
                  type="button"
                  className="c-btn is-brand"
                  onClick={() =>
                    act({ type: "completeTask", id: t.id, outcome: "Xong từ Mini App", actor: me }, "Đã xong")
                  }
                >
                  Xong
                </button>
                <button
                  type="button"
                  className="c-btn"
                  onClick={() =>
                    act({ type: "snoozeTask", id: t.id, minutes: 60, actor: me }, "Đã dời 1 giờ")
                  }
                >
                  Dời 1 giờ
                </button>
                {t.oppId ? (
                  <button
                    type="button"
                    className="c-btn is-ghost"
                    onClick={() => {
                      setTab("lead");
                      setLeadId(t.oppId);
                    }}
                  >
                    Mở lead
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "lead" && lead ? (
        <LeadCard oppId={lead.id} onBack={() => setLeadId(undefined)} />
      ) : tab === "lead" ? (
        <ul className="ma-list">
          {myLeads.length === 0 ? <li className="c-empty">Chưa có lead nào đang giữ.</li> : null}
          {myLeads.map((o) => (
            <li key={o.id}>
              <button type="button" className="ma-row" onClick={() => setLeadId(o.id)}>
                <span className="min-w-0 flex-1">
                  <b>{o.name}</b> <LocTag loc={o.city ? "KR" : "VN"} />
                  <span className="c-lbl block">
                    {o.product.replace("Ghế massage ", "Ghế ")} · {STAGES[o.stage]}
                  </span>
                </span>
                <SlaPill oppId={o.id} />
                <ChevronRight size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "don" ? (
        <ul className="ma-list">
          {orders.length === 0 ? <li className="c-empty">Không có đơn đang chạy.</li> : null}
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="ma-row">
                <span className="min-w-0 flex-1">
                  <b className="tabular">{o.code}</b> · {orderPeople(o).buyer}
                  <span className="c-lbl block">
                    {ORDER_STATUS[o.status].label} · còn {vnd(Math.max(0, orderMoney(o).balance))}
                  </span>
                </span>
                <ChevronRight size={16} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "duyet" ? <ApprovalList items={approvals} /> : null}

      {tab === "tim" ? (
        <div>
          <label className="tg-search ma-search">
            <Search size={16} aria-hidden />
            <input
              aria-label="Tìm lead, mã đơn"
              placeholder="Tên khách hoặc mã đơn"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          {q.trim() ? (
            <ul className="ma-list">
              {leads
                .filter((o) => o.name.toLowerCase().includes(q.toLowerCase()))
                .map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="ma-row"
                      onClick={() => {
                        setTab("lead");
                        setLeadId(o.id);
                      }}
                    >
                      <span className="flex-1">
                        <b>{o.name}</b>
                        <span className="c-lbl block">Lead · {STAGES[o.stage]}</span>
                      </span>
                      <ChevronRight size={16} aria-hidden />
                    </button>
                  </li>
                ))}
              {visibleOrders(state.orders, perms, userId)
                .filter(
                  (o) =>
                    o.code.toLowerCase().includes(q.toLowerCase()) ||
                    orderPeople(o).buyer.toLowerCase().includes(q.toLowerCase()),
                )
                .map((o) => (
                  <li key={o.id}>
                    <button type="button" className="ma-row" onClick={() => router.push(`/orders/${o.id}`)}>
                      <span className="flex-1">
                        <b className="tabular">{o.code}</b>
                        <span className="c-lbl block">
                          Đơn · {orderPeople(o).buyer} · {ORDER_STATUS[o.status].label}
                        </span>
                      </span>
                      <ChevronRight size={16} aria-hidden />
                    </button>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="c-lbl">Gõ tên khách hoặc mã đơn, chỉ tìm trong phạm vi anh chị được xem.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Thẻ lead gọn: gọi (hiện số theo quyền, có nhật ký), ghi nhanh kết quả, xem thông tin còn thiếu. */
function LeadCard({ oppId, onBack }: { oppId: string; onBack: () => void }) {
  const { state, act, who } = useCrm();
  const { me } = useShell();
  const router = useRouter();
  const [shown, setShown] = useState(false);
  const o = state.opps.find((x) => x.id === oppId)!;
  const info = state.leadInfo[o.id] ?? newLeadInfo("VN");
  const missing = missingInfo(info);
  const canCall = revealAllowed(state, who, o.id, "buyer");
  const outcomes = state.settings.catalogs.outcomes.items.filter((i) => i.active).map((i) => i.label);
  const log = (outcome: string, callbackAt?: number) =>
    act(
      { type: "logCall", oppId: o.id, channel: "Điện thoại", outcome, note: "", callbackAt, actor: me },
      `Đã ghi: ${outcome}`,
    );

  return (
    <div className="ma-card" aria-label={`Lead ${o.name}`}>
      <button type="button" className="c-link" onClick={onBack}>
        ← Lead của tôi
      </button>
      <b className="text-[18px]">{o.name}</b>
      <span className="c-lbl">
        {o.product} · {STAGES[o.stage]} <SlaPill oppId={o.id} />
      </span>
      <p className="m-0">{o.next}</p>
      {missing.length ? <p className="m-0 text-warn">Còn thiếu: {missing.join(", ")}</p> : null}
      <div className="ma-acts">
        {canCall ? (
          shown ? (
            <a className="c-btn is-go" href={`tel:${info.buyerPhone.replace(/\s/g, "")}`}>
              <Phone size={14} className="mr-1 inline" aria-hidden /> {info.buyerPhone}
            </a>
          ) : (
            <button
              type="button"
              className="c-btn is-go"
              onClick={() => {
                act({ type: "revealPhone", oppId: o.id, who: "buyer", actor: me });
                setShown(true);
              }}
            >
              <Phone size={14} className="mr-1 inline" aria-hidden /> Gọi
            </button>
          )
        ) : null}
        <button
          type="button"
          className="c-btn is-ghost"
          onClick={() => {
            act({ type: "selectOpp", id: o.id });
            router.push("/opportunities");
          }}
        >
          Mở hồ sơ đầy đủ
        </button>
      </div>
      <b className="mt-2">Ghi nhanh kết quả cuộc gọi</b>
      <div className="ma-acts">
        {outcomes.slice(0, 4).map((x) => (
          <button key={x} type="button" className="c-btn" onClick={() => log(x)}>
            {x}
          </button>
        ))}
        <button type="button" className="c-btn" onClick={() => log("Hẹn gọi lại", state.minutes + 60)}>
          Hẹn gọi lại sau 1 giờ
        </button>
      </div>
    </div>
  );
}
