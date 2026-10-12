"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { MarketTag, type MarketInfo } from "@/components/market-tag";
import { PersonChip } from "@/components/person-chip";
import { useToast } from "@/components/ui/toast";
import { formatMoneyShort } from "@/lib/format";
import { LEAD_STAGE_LABEL } from "@/lib/leads/labels";
import type { SlaTone } from "@/lib/leads/sla-badge";
import { BOARD_STAGES, manualTargets, moveBlockReason, type BoardStage } from "@/lib/leads/stages";

import { PageHead } from "../parts";

// Lead dạng bảng Kanban (route /leads?layout=board, Owner chốt 12/10/2026: lead chính là cơ hội, theo dõi theo giai
// đoạn ngay trong menu Lead). Kéo thả trên máy tính, ô "Chuyển sang" trên điện thoại; chỉ những bước người được chuyển
// tay (lib/leads/stages.ts), database kiểm lại quyền và bốn thông tin bắt buộc.

type Result = { ok: boolean; message: string };

export interface BoardCard {
  id: string;
  stage: string;
  name: string;
  market: string;
  source: string;
  ownerName: string | null;
  /** Tổng đơn đang có, chưa có đơn thì báo giá gần nhất (đồng). */
  value: number | null;
  sla: { tone: SlaTone; text: string } | null;
  /** Bốn thông tin bắt buộc còn thiếu (chỉ tính khi chưa sang Demo). */
  missing: string[];
  phoneInvalid: boolean;
  editable: boolean;
  updatedAt: string;
}

export interface BoardData {
  cards: BoardCard[];
  total: number;
  limit: number;
  closedDays: number;
  markets: MarketInfo[];
  sources: { key: string; label: string }[];
  lostReasons: { key: string; label: string }[];
}

export interface LeadBoardActions {
  moveLeadStage(i: { leadId: string; to: "contacted" | "demo" }): Promise<Result>;
  markLost(i: { leadId: string; reasonKey: string }): Promise<Result>;
}

const SELECT = "rounded-control border border-line bg-surface px-1.5 py-1 text-text";
const PILL: Record<SlaTone, string> = { n: "is-n", warn: "is-warn", err: "is-err", ok: "is-ok", ai: "is-ai" };

export function LeadBoard({
  data,
  filters,
  teamView,
  canMarkLost,
  actions,
}: {
  data: BoardData;
  filters: { mine: boolean; market: string; source: string; q: string };
  teamView: boolean;
  canMarkLost: boolean;
  actions: LeadBoardActions;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState(filters.q);
  const [drag, setDrag] = useState<string | null>(null);
  const [losing, setLosing] = useState<BoardCard | null>(null);
  const [reason, setReason] = useState("");

  function hrefWith(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  function run(fn: () => Promise<Result>, after?: () => void) {
    start(async () => {
      try {
        const r = await fn();
        toast(r.message, r.ok ? "ok" : "err");
        if (r.ok) {
          after?.();
          router.refresh();
        }
      } catch {
        toast("Chưa chuyển được, thử lại sau ít phút.", "err");
      }
    });
  }

  function move(card: BoardCard, to: BoardStage) {
    if (card.stage === to) return;
    const blocked = moveBlockReason(card.stage, to);
    if (blocked) return toast(blocked, "err");
    if (!card.editable) return toast("Lead này không do anh chị giữ, chưa chuyển được.", "err");
    if (to === "lost") {
      if (!canMarkLost) return toast("Anh chị chưa được cấp quyền đánh dấu thất bại.", "err");
      setReason("");
      setLosing(card);
      return;
    }
    if (to === "contacted" || to === "demo") run(() => actions.moveLeadStage({ leadId: card.id, to }));
  }

  const open = data.cards.filter((c) => c.stage !== "won" && c.stage !== "lost");
  const openValue = open.reduce((s, c) => s + (c.value ?? 0), 0);

  return (
    <div className="c-stack c-flat">
      <section className="c-card">
        <PageHead
          icon={UserPlus}
          color="var(--obj-lead)"
          kicker={filters.mine || !teamView ? "Của tôi" : "Toàn showroom"}
          title="Lead"
        >
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(hrefWith({ q: search.trim() || null }));
            }}
          >
            <input
              aria-label="Tìm theo tên khách"
              placeholder="Tìm theo tên khách"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={SELECT}
            />
          </form>
        </PageHead>
        <div className="c-cb">
          <LayoutSwitch board />
          <p className="c-lbl mt-2 mb-0">
            {open.length} lead đang mở
            {openValue ? `, giá trị theo báo giá và đơn ${formatMoneyShort(openValue)}` : ""}. Cột Chốt đơn,
            Thất bại giữ lead đóng trong {data.closedDays} ngày.
            {data.total > data.cards.length ? ` Đang hiện ${data.cards.length} lead mới cập nhật nhất.` : ""}
          </p>
          <nav aria-label="Lọc bảng lead" className="mt-2 flex flex-wrap items-center gap-1.5">
            {teamView ? (
              <>
                <Link
                  href={hrefWith({ view: null })}
                  aria-current={!filters.mine ? "page" : undefined}
                  className={`c-pill ${!filters.mine ? "is-info" : "is-n"}`}
                >
                  Cả showroom
                </Link>
                <Link
                  href={hrefWith({ view: "mine" })}
                  aria-current={filters.mine ? "page" : undefined}
                  className={`c-pill ${filters.mine ? "is-info" : "is-n"}`}
                >
                  Của tôi
                </Link>
              </>
            ) : null}
            <select
              aria-label="Thị trường"
              value={filters.market}
              onChange={(e) => router.push(hrefWith({ market: e.target.value || null }))}
              className={SELECT}
            >
              <option value="">Mọi thị trường</option>
              {data.markets.map((m) => (
                <option key={m.country_code} value={m.country_code}>
                  {m.name}
                </option>
              ))}
              <option value="unknown">Chưa rõ nơi ở</option>
            </select>
            <select
              aria-label="Nguồn"
              value={filters.source}
              onChange={(e) => router.push(hrefWith({ source: e.target.value || null }))}
              className={`${SELECT} max-w-56`}
            >
              <option value="">Mọi nguồn</option>
              {data.sources.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            {filters.q || filters.market || filters.source ? (
              <Link href={hrefWith({ q: null, market: null, source: null })} className="c-link">
                Bỏ lọc
              </Link>
            ) : null}
          </nav>
        </div>
      </section>

      {losing ? (
        <section className="c-card" role="dialog" aria-label="Đánh dấu thất bại">
          <form
            className="c-cb flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason) return toast("Chọn lý do thất bại.", "err");
              const id = losing.id;
              run(
                () => actions.markLost({ leadId: id, reasonKey: reason }),
                () => setLosing(null),
              );
            }}
          >
            <span>
              Đánh dấu <b>{losing.name}</b> thất bại. Các việc đã lên lịch được hủy kèm lý do.
            </span>
            <select
              aria-label="Lý do thất bại"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={SELECT}
              required
            >
              <option value="">Chọn lý do…</option>
              {data.lostReasons.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
            <button type="submit" className="c-btn is-danger" disabled={pending}>
              Xác nhận thất bại
            </button>
            <button type="button" className="c-btn" onClick={() => setLosing(null)}>
              Thôi
            </button>
          </form>
        </section>
      ) : null}

      <div className="overflow-x-auto pb-2" aria-busy={pending}>
        <div className="grid min-w-[1400px] grid-cols-7 gap-2" aria-label="Bảng lead theo giai đoạn">
          {BOARD_STAGES.map((stage) => {
            const col = data.cards.filter((c) => c.stage === stage);
            const sum = col.reduce((s, c) => s + (c.value ?? 0), 0);
            const dragged = data.cards.find((c) => c.id === drag);
            const allowed = dragged ? !moveBlockReason(dragged.stage, stage) : false;
            return (
              <section
                key={stage}
                aria-label={LEAD_STAGE_LABEL[stage]}
                className={`c-col ${dragged && allowed && dragged.stage !== stage ? "outline-2 outline-brand outline-dashed" : ""}`}
                onDragOver={(e) => {
                  if (drag) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(null);
                  if (dragged) move(dragged, stage);
                }}
              >
                <div className="c-colh">
                  <b>{LEAD_STAGE_LABEL[stage]}</b>
                  <span className="c-lbl tabular">
                    {col.length}
                    {sum ? ` · ${formatMoneyShort(sum)}` : ""}
                  </span>
                </div>
                {col.length === 0 ? <p className="c-lbl m-0 px-1 py-3 text-center">Chưa có lead</p> : null}
                <ul className="m-0 list-none p-0">
                  {col.map((c) => (
                    <BoardItem
                      key={c.id}
                      card={c}
                      markets={data.markets}
                      dragging={drag === c.id}
                      canMarkLost={canMarkLost}
                      onDragStart={() => setDrag(c.id)}
                      onDragEnd={() => setDrag(null)}
                      onMove={(to) => move(c, to)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Nút chuyển giữa Danh sách và Bảng, giữ nguyên bộ lọc đang chọn. */
export function LayoutSwitch({ board }: { board: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const href = (layout: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (layout) next.set("layout", layout);
    else next.delete("layout");
    // Góc nhìn riêng của danh sách (chưa phân, quá hạn, chờ khung, đã đóng) không có trên bảng.
    if (layout && next.get("view") !== "mine") next.delete("view");
    if (layout) next.delete("stage");
    const s = next.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  return (
    <nav aria-label="Cách xem lead" className="c-ftabs m-0">
      <Link href={href(null)} aria-current={!board ? "page" : undefined} className="c-ftab">
        Danh sách
      </Link>
      <Link href={href("board")} aria-current={board ? "page" : undefined} className="c-ftab">
        Bảng theo giai đoạn
      </Link>
    </nav>
  );
}

function BoardItem({
  card: c,
  markets,
  dragging,
  canMarkLost,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  card: BoardCard;
  markets: MarketInfo[];
  dragging: boolean;
  canMarkLost: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: BoardStage) => void;
}) {
  const targets = c.editable ? manualTargets(c.stage).filter((t) => t !== "lost" || canMarkLost) : [];
  return (
    <li
      aria-label={c.name}
      draggable={targets.length > 0}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`c-kc ${dragging ? "opacity-50" : ""} ${targets.length ? "cursor-grab" : "cursor-default"}`}
    >
      <Link href={`/leads/${c.id}`} className="c-link block truncate font-semibold" title={c.name}>
        {c.name || "Khách"}
      </Link>
      <div className="c-lbl mt-0.5 flex min-w-0 items-center gap-1.5 whitespace-nowrap">
        <MarketTag code={c.market} markets={markets} />
        <span className="truncate">{c.source}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
        {c.sla ? <span className={`c-pill ${PILL[c.sla.tone]}`}>{c.sla.text}</span> : null}
        {c.missing.length ? (
          <span className="c-pill is-warn" title={`Thiếu: ${c.missing.join(", ")}`}>
            Thiếu {c.missing.length} thông tin
          </span>
        ) : null}
        {c.phoneInvalid ? <span className="c-pill is-err">Số sai dạng</span> : null}
      </div>
      {c.ownerName || c.value ? (
        <div className="c-kf">
          <span className="min-w-0 flex-1 truncate">
            {c.ownerName ? <PersonChip name={c.ownerName} /> : null}
          </span>
          {c.value ? <span className="tabular">{formatMoneyShort(c.value)}</span> : null}
        </div>
      ) : null}
      {targets.length ? (
        <select
          aria-label={`Chuyển ${c.name} sang`}
          className={`${SELECT} mt-1.5 w-full text-sm`}
          value=""
          onChange={(e) => e.target.value && onMove(e.target.value as BoardStage)}
        >
          <option value="">Chuyển sang…</option>
          {targets.map((t) => (
            <option key={t} value={t}>
              {LEAD_STAGE_LABEL[t]}
            </option>
          ))}
        </select>
      ) : null}
    </li>
  );
}
