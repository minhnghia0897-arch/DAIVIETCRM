"use client";

import {
  Bot,
  Flag,
  Home,
  MessageCircle,
  MessageSquare,
  Phone,
  ShoppingCart,
  Truck,
  Video,
  type LucideIcon,
} from "lucide-react";

import { agentById, type AgentId, type Loc, type TimelineKind } from "@/lib/demo/crm-data";
import { useCrm, type FeedItem, type QueueItem } from "./store";

// Mảnh giao diện dùng chung cho các màn hình theo bản mẫu.

export function LocTag({ loc, city }: { loc: Loc; city?: string }) {
  return (
    <span className={`c-loc ${loc === "KR" ? "is-kr" : "is-vn"}`}>
      {loc === "KR" ? "Hàn" : "VN"}
      {city ? ` · ${city}` : ""}
    </span>
  );
}

export function AgentIcon({ id, size }: { id: AgentId; size?: "sm" | "lg" }) {
  const a = agentById(id);
  return (
    <span
      className={`c-oi is-round ${size === "sm" ? "is-sm" : size === "lg" ? "is-lg" : ""}`}
      style={{ background: a.color }}
      title={a.name}
      aria-hidden
    >
      <Bot />
    </span>
  );
}

export function PageHead({
  icon: Icon,
  color,
  kicker,
  title,
  children,
}: {
  icon: LucideIcon;
  color: string;
  kicker: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="c-phd">
      <span className="c-oi is-lg" style={{ background: color }} aria-hidden>
        <Icon />
      </span>
      <div className="c-t">
        <small>{kicker}</small>
        <h1 className="m-0">
          <b>{title}</b>
        </h1>
      </div>
      {children ? <div className="c-r">{children}</div> : null}
    </div>
  );
}

export function Steps({ labels, current }: { labels: string[]; current: number }) {
  return (
    <div className="c-steps" role="list" aria-label="Tiến độ">
      {labels.map((l, i) => (
        <span
          key={l}
          role="listitem"
          aria-current={i === current ? "step" : undefined}
          className={i < current ? "is-done" : i === current ? "is-cur" : undefined}
        >
          {l}
        </span>
      ))}
    </div>
  );
}

export function FeedList({
  items,
  limit,
  onSelect,
  selected,
}: {
  items: FeedItem[];
  limit?: number;
  onSelect?: (id: string) => void;
  selected?: string | null;
}) {
  const list = limit ? items.slice(0, limit) : items;
  if (!list.length) return <p className="c-empty">Chưa có hoạt động.</p>;
  return (
    <ul className="c-feed" aria-label="Nhật ký agent">
      {list.map((f) => {
        const body = (
          <>
            <AgentIcon id={f.agent} size="sm" />
            <div>
              <div>{f.text}</div>
              <div className="c-an">{agentById(f.agent).name}</div>
            </div>
            <div className="text-right">
              <span className={`c-pill ${f.money ? "is-ok" : "is-n"}`}>{f.result}</span>
              <div className="c-an tabular">{f.time}</div>
            </div>
          </>
        );
        return (
          <li
            key={f.id}
            className={selected === f.id ? "bg-brand-soft" : undefined}
            style={onSelect ? { cursor: "pointer" } : undefined}
            onClick={onSelect ? () => onSelect(f.id) : undefined}
          >
            {body}
          </li>
        );
      })}
    </ul>
  );
}

export function ApprovalList({ items, canDecide }: { items: QueueItem[]; canDecide: boolean }) {
  const { act } = useCrm();
  if (!items.length) return <p className="c-empty">Không có việc chờ duyệt.</p>;
  return (
    <div>
      {items.map((q) => (
        <div key={q.id} className="c-appr">
          <div className="flex items-start gap-2">
            <AgentIcon id={q.agent} size="sm" />
            <div className="min-w-0 flex-1">
              <div>{q.text}</div>
              <div className="c-lbl">
                {q.why} · {q.time}
              </div>
            </div>
          </div>
          <div className="mt-2 flex gap-1.5 pl-[30px]">
            {canDecide ? (
              <>
                <button
                  type="button"
                  className="c-btn is-brand"
                  onClick={() => act({ type: "decide", id: q.id, ok: true }, "Đã duyệt")}
                >
                  Duyệt
                </button>
                <button
                  type="button"
                  className="c-btn"
                  onClick={() => act({ type: "decide", id: q.id, ok: false }, "Đã từ chối")}
                >
                  Từ chối
                </button>
              </>
            ) : (
              <span className="c-pill is-warn">Chờ quản lý duyệt</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const KIND: Record<TimelineKind, { icon: LucideIcon; color: string }> = {
  call: { icon: Phone, color: "var(--obj-call)" },
  zalo: { icon: MessageCircle, color: "var(--obj-zalo)" },
  truck: { icon: Truck, color: "var(--ok)" },
  cart: { icon: ShoppingCart, color: "var(--obj-lead)" },
  flag: { icon: Flag, color: "var(--err)" },
  chat: { icon: MessageSquare, color: "var(--text)" },
  house: { icon: Home, color: "var(--obj-contact)" },
  video: { icon: Video, color: "var(--brand)" },
};

export function KindIcon({ kind }: { kind: TimelineKind }) {
  const k = KIND[kind];
  const Icon = k.icon;
  return (
    <span className="c-oi is-round is-sm" style={{ background: k.color }} aria-hidden>
      <Icon />
    </span>
  );
}

export function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <span className="c-ava" style={{ background: color }} aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}
