"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Columns3, ExternalLink, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ui/toast";
import {
  CONTENT_CHANNELS,
  CONTENT_FORMATS,
  CONTENT_STAGES,
  REVIEW_CHECKS,
  columnItems,
  isOverdue,
  publishTimeLabel,
  stageBlocker,
  vnDay,
  weekDays,
  type ContentChannel,
  type ContentFormat,
  type ContentInput,
  type ContentItem,
  type ContentStage,
} from "@/lib/marketing/content";

import { PageHead } from "../parts";

// Lịch nội dung dạng Kanban (Marketing): kéo thả thẻ giữa các cột trên máy tính, nút "Chuyển sang" trên điện thoại
// và bàn phím; dạng lịch tuần theo ngày đăng (giờ VN). Luật cột kiểm ở database; giao diện báo trước cho nhanh.

type Result = { ok: boolean; message: string };
const FIELD = "mt-0.5 block w-full rounded-control border border-line bg-surface px-2 py-1.5 text-text";
const SELECT = "rounded-control border border-line bg-surface px-2 py-1";
const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export interface ContentActions {
  save: (input: ContentInput) => Promise<Result>;
  move: (input: {
    id: string;
    status: ContentStage;
    before?: string | null;
    postUrl?: string;
  }) => Promise<Result>;
  remove: (input: { id: string }) => Promise<Result>;
}

export interface Option {
  value: string;
  label: string;
}

export function ContentBoard({
  items: initial,
  people,
  markets,
  campaigns,
  canManage,
  now: nowIso,
  actions,
}: {
  items: ContentItem[];
  people: Option[];
  markets: Option[];
  campaigns: Option[];
  canManage: boolean;
  /** Thời điểm hiện tại từ server (ISO), để bản thật và bản demo cùng cách tính quá hạn. */
  now: string;
  actions: ContentActions;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [items, setItems] = useState(initial);
  const [view, setView] = useState<"board" | "week">("board");
  const [week, setWeek] = useState(0);
  const [editing, setEditing] = useState<ContentItem | "new" | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [filter, setFilter] = useState({ channel: "", owner: "", market: "" });
  const now = new Date(nowIso);

  // Dữ liệu mới từ server (sau khi lưu) thay cho bản đã đổi tạm trên màn.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial);
  }

  const shown = items.filter(
    (i) =>
      (!filter.channel || i.channel === filter.channel) &&
      (!filter.owner || i.ownerId === filter.owner) &&
      (!filter.market || i.market === filter.market),
  );
  const overdue = items.filter((i) => isOverdue(i, now)).length;

  function move(item: ContentItem, to: ContentStage, before: string | null = null) {
    if (item.status === to && !before) return;
    const blocker = stageBlocker(item, to);
    if (blocker) {
      toast(`${blocker} Mở bài để bổ sung.`, "err");
      setEditing(item);
      return;
    }
    // Đổi ngay trên màn rồi mới lưu; lưu lỗi thì tải lại dữ liệu thật.
    const target = columnItems(items, to).filter((i) => i.id !== item.id);
    const idx = before ? target.findIndex((i) => i.id === before) : -1;
    const position =
      idx < 0
        ? (target.at(-1)?.position ?? 0) + 1
        : ((idx > 0 ? target[idx - 1].position : target[idx].position - 1) + target[idx].position) / 2;
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, status: to, position } : i)));
    start(async () => {
      const r = await actions.move({ id: item.id, status: to, before });
      toast(r.message, r.ok ? "ok" : "err");
      router.refresh();
    });
  }

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead icon={CalendarDays} color="var(--brand)" kicker="Marketing" title="Lịch nội dung">
          {overdue ? <span className="c-pill is-err">Quá giờ đăng {overdue}</span> : null}
          <span className="flex gap-1" role="group" aria-label="Cách xem">
            <button
              type="button"
              className={`c-btn inline-flex items-center gap-1 ${view === "board" ? "is-blue" : ""}`}
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
            >
              <Columns3 size={15} aria-hidden /> Bảng
            </button>
            <button
              type="button"
              className={`c-btn inline-flex items-center gap-1 ${view === "week" ? "is-blue" : ""}`}
              aria-pressed={view === "week"}
              onClick={() => setView("week")}
            >
              <CalendarDays size={15} aria-hidden /> Lịch tuần
            </button>
          </span>
          {canManage ? (
            <button
              type="button"
              className="c-btn is-brand inline-flex items-center gap-1"
              onClick={() => setEditing("new")}
            >
              <Plus size={15} aria-hidden /> Thêm bài
            </button>
          ) : null}
        </PageHead>
        <div className="mx-4 mb-3 flex flex-wrap gap-2" role="group" aria-label="Lọc bài">
          <select
            aria-label="Lọc theo kênh"
            className={SELECT}
            value={filter.channel}
            onChange={(e) => setFilter({ ...filter, channel: e.target.value })}
          >
            <option value="">Mọi kênh</option>
            {Object.entries(CONTENT_CHANNELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label="Lọc theo người phụ trách"
            className={SELECT}
            value={filter.owner}
            onChange={(e) => setFilter({ ...filter, owner: e.target.value })}
          >
            <option value="">Mọi người</option>
            {people.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Lọc theo thị trường"
            className={SELECT}
            value={filter.market}
            onChange={(e) => setFilter({ ...filter, market: e.target.value })}
          >
            <option value="">Mọi thị trường</option>
            {markets.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {editing ? (
        <ContentForm
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? null : editing}
          people={people}
          markets={markets}
          campaigns={campaigns}
          canManage={canManage}
          actions={actions}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {view === "board" ? (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1080px] grid-cols-6 gap-2">
            {CONTENT_STAGES.map((stage) => {
              const col = columnItems(shown, stage.key);
              return (
                <section
                  key={stage.key}
                  aria-label={stage.label}
                  className="c-card min-h-40"
                  onDragOver={(e) => {
                    if (drag) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const item = items.find((i) => i.id === drag);
                    setDrag(null);
                    if (item) move(item, stage.key);
                  }}
                >
                  <div className="c-ch">
                    <h2>{stage.label}</h2>
                    <span className="c-r c-lbl tabular">{col.length}</span>
                  </div>
                  <ul className="m-0 list-none space-y-2 p-2">
                    {col.length === 0 ? <li className="c-lbl px-1 py-3 text-center">Chưa có bài</li> : null}
                    {col.map((item) => (
                      <ContentCard
                        key={item.id}
                        item={item}
                        now={now}
                        canManage={canManage}
                        dragging={drag === item.id}
                        onDragStart={() => setDrag(item.id)}
                        onDragEnd={() => setDrag(null)}
                        onDropBefore={() => {
                          const dragged = items.find((i) => i.id === drag);
                          setDrag(null);
                          if (dragged && dragged.id !== item.id) move(dragged, stage.key, item.id);
                        }}
                        onMove={(to) => move(item, to)}
                        onOpen={() => setEditing(item)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <WeekView items={shown} now={now} week={week} setWeek={setWeek} onOpen={(i) => setEditing(i)} />
      )}
    </div>
  );
}

function ContentCard({
  item,
  now,
  canManage,
  dragging,
  onDragStart,
  onDragEnd,
  onDropBefore,
  onMove,
  onOpen,
}: {
  item: ContentItem;
  now: Date;
  canManage: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: () => void;
  onMove: (to: ContentStage) => void;
  onOpen: () => void;
}) {
  const late = isOverdue(item, now);
  const checked = item.checks.no_health_claim && item.checks.customer_consent;
  return (
    <li
      aria-label={item.title}
      draggable={canManage}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropBefore();
      }}
      className={`rounded-control border bg-surface p-2.5 ${late ? "border-err" : "border-line"} ${
        dragging ? "opacity-50" : ""
      } ${canManage ? "cursor-grab" : ""}`}
    >
      <button type="button" className="c-link block w-full text-left font-semibold" onClick={onOpen}>
        {item.title}
      </button>
      <div className="mt-1 flex flex-wrap gap-1">
        <span className="c-pill is-n">{CONTENT_CHANNELS[item.channel]}</span>
        <span className="c-pill is-n">{CONTENT_FORMATS[item.format]}</span>
        {item.status === "review" ? (
          <span className={`c-pill ${checked ? "is-ok" : "is-warn"}`}>
            {checked ? "Đã kiểm nội dung" : "Chưa kiểm nội dung"}
          </span>
        ) : null}
      </div>
      <p className={`m-0 mt-1 text-sm ${late ? "text-err" : "c-lbl"}`}>
        {item.publishAt
          ? `${late ? "Quá giờ đăng · " : ""}${vnDay(item.publishAt).slice(8, 10)}/${vnDay(item.publishAt).slice(5, 7)} ${publishTimeLabel(item.publishAt, item.market)}`
          : "Chưa có ngày đăng"}
      </p>
      {item.ownerName ? <p className="c-lbl m-0 text-sm">{item.ownerName}</p> : null}
      {item.postUrl ? (
        <a
          className="c-link inline-flex items-center gap-1 text-sm"
          href={item.postUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={13} aria-hidden /> Xem bài
        </a>
      ) : null}
      {canManage ? (
        <select
          aria-label={`Chuyển ${item.title} sang`}
          className={`${SELECT} mt-1.5 w-full text-sm`}
          value=""
          onChange={(e) => e.target.value && onMove(e.target.value as ContentStage)}
        >
          <option value="">Chuyển sang…</option>
          {CONTENT_STAGES.filter((s) => s.key !== item.status).map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      ) : null}
    </li>
  );
}

function WeekView({
  items,
  now,
  week,
  setWeek,
  onOpen,
}: {
  items: ContentItem[];
  now: Date;
  week: number;
  setWeek: (n: number) => void;
  onOpen: (i: ContentItem) => void;
}) {
  const days = weekDays(now, week);
  const today = vnDay(now.toISOString());
  const dated = items.filter((i) => i.publishAt);
  return (
    <section className="c-card" aria-label="Lịch tuần">
      <div className="c-ch">
        <h2>
          Tuần {days[0].slice(8, 10)}/{days[0].slice(5, 7)} – {days[6].slice(8, 10)}/{days[6].slice(5, 7)}
        </h2>
        <span className="c-r flex gap-1">
          <button type="button" className="c-btn" aria-label="Tuần trước" onClick={() => setWeek(week - 1)}>
            <ChevronLeft size={15} />
          </button>
          <button type="button" className="c-btn" onClick={() => setWeek(0)}>
            Tuần này
          </button>
          <button type="button" className="c-btn" aria-label="Tuần sau" onClick={() => setWeek(week + 1)}>
            <ChevronRight size={15} />
          </button>
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[840px] grid-cols-7 gap-2 p-2">
          {days.map((d, i) => {
            const list = dated
              .filter((x) => vnDay(x.publishAt!) === d)
              .sort((a, b) => a.publishAt!.localeCompare(b.publishAt!));
            return (
              <div
                key={d}
                aria-label={`${DOW[i]} ${d.slice(8, 10)}/${d.slice(5, 7)}`}
                role="group"
                className={`min-h-32 rounded-control border p-2 ${d === today ? "border-brand" : "border-line"}`}
              >
                <b className="block text-sm">
                  {DOW[i]} {d.slice(8, 10)}/{d.slice(5, 7)}
                </b>
                {list.length === 0 ? <span className="c-lbl text-sm">Trống</span> : null}
                <ul className="m-0 mt-1 list-none space-y-1 p-0">
                  {list.map((x) => (
                    <li key={x.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(x)}
                        className={`w-full rounded-control bg-surface-2 px-1.5 py-1 text-left text-sm ${
                          isOverdue(x, now) ? "text-err" : ""
                        }`}
                      >
                        <span className="tabular">{publishTimeLabel(x.publishAt!, x.market)}</span>{" "}
                        <b>{CONTENT_CHANNELS[x.channel]}</b>
                        <span className="block">{x.title}</span>
                        <span className="c-lbl">{CONTENT_STAGES.find((s) => s.key === x.status)?.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** "2026-10-20T12:00:00Z" → "2026-10-20T19:00" (ô datetime-local theo giờ VN) và ngược lại. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return d.toISOString().slice(0, 16);
}
function fromLocalInput(v: string): string {
  return v ? `${v}:00+07:00` : "";
}

function ContentForm({
  item,
  people,
  markets,
  campaigns,
  canManage,
  actions,
  onClose,
}: {
  item: ContentItem | null;
  people: Option[];
  markets: Option[];
  campaigns: Option[];
  canManage: boolean;
  actions: ContentActions;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    title: item?.title ?? "",
    channel: (item?.channel ?? "facebook") as ContentChannel,
    format: (item?.format ?? "short_video") as ContentFormat,
    status: (item?.status ?? "idea") as ContentStage,
    ownerId: item?.ownerId ?? "",
    publishAt: toLocalInput(item?.publishAt ?? null),
    market: item?.market ?? "",
    product: item?.product ?? "",
    campaignId: item?.campaignId ?? "",
    draftUrl: item?.draftUrl ?? "",
    postUrl: item?.postUrl ?? "",
    note: item?.note ?? "",
    checks: item?.checks ?? { no_health_claim: false, customer_consent: false },
  });
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });
  const ro = !canManage;
  const title = item ? item.title : "Bài mới";

  function submit() {
    const input: ContentInput = {
      ...(item ? { id: item.id } : {}),
      ...f,
      publishAt: fromLocalInput(f.publishAt),
    };
    const blocker = stageBlocker(
      { publishAt: input.publishAt || null, postUrl: f.postUrl || null, checks: f.checks },
      f.status,
    );
    if (blocker) return toast(blocker, "err");
    start(async () => {
      const r = await actions.save(input);
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <section className="c-card" aria-label={item ? `Bài ${item.title}` : "Bài mới"}>
      <div className="c-ch">
        <h2>{title}</h2>
      </div>
      <form
        className="c-cb grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <fieldset disabled={ro} className="contents">
          <label className="c-lbl sm:col-span-2">
            Tiêu đề
            <input className={FIELD} value={f.title} onChange={set("title")} required maxLength={200} />
          </label>
          <label className="c-lbl">
            Cột
            <select className={FIELD} value={f.status} onChange={set("status")}>
              {CONTENT_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="c-lbl">
            Kênh
            <select className={FIELD} value={f.channel} onChange={set("channel")}>
              {Object.entries(CONTENT_CHANNELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="c-lbl">
            Dạng nội dung
            <select className={FIELD} value={f.format} onChange={set("format")}>
              {Object.entries(CONTENT_FORMATS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="c-lbl">
            Ngày giờ đăng (giờ VN)
            <input type="datetime-local" className={FIELD} value={f.publishAt} onChange={set("publishAt")} />
          </label>
          <label className="c-lbl">
            Người phụ trách
            <select className={FIELD} value={f.ownerId} onChange={set("ownerId")}>
              <option value="">Tôi</option>
              {people.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="c-lbl">
            Thị trường khách
            <select className={FIELD} value={f.market} onChange={set("market")}>
              <option value="">Mọi thị trường</option>
              {markets.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="c-lbl">
            Chiến dịch
            <select className={FIELD} value={f.campaignId} onChange={set("campaignId")}>
              <option value="">Không gắn chiến dịch</option>
              {campaigns.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="c-lbl">
            Sản phẩm
            <input className={FIELD} value={f.product} onChange={set("product")} maxLength={200} />
          </label>
          <label className="c-lbl">
            Link bản nháp
            <input className={FIELD} value={f.draftUrl} onChange={set("draftUrl")} placeholder="https://…" />
          </label>
          <label className="c-lbl">
            Link bài đã đăng
            <input className={FIELD} value={f.postUrl} onChange={set("postUrl")} placeholder="https://…" />
          </label>
          <label className="c-lbl sm:col-span-2 lg:col-span-3">
            Ghi chú
            <textarea className={FIELD} rows={2} value={f.note} onChange={set("note")} maxLength={2000} />
          </label>
          <fieldset className="rounded-control border border-line p-2 sm:col-span-2 lg:col-span-3">
            <legend className="c-lbl px-1">Kiểm nội dung trước khi lên lịch</legend>
            {(Object.keys(REVIEW_CHECKS) as (keyof typeof REVIEW_CHECKS)[]).map((k) => (
              <label key={k} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={f.checks[k]}
                  onChange={(e) => setF({ ...f, checks: { ...f.checks, [k]: e.target.checked } })}
                />
                <span>{REVIEW_CHECKS[k]}</span>
              </label>
            ))}
          </fieldset>
        </fieldset>
        <div className="flex flex-wrap gap-1.5 sm:col-span-2 lg:col-span-3">
          {canManage ? (
            <button type="submit" className="c-btn is-brand" disabled={pending}>
              {item ? "Lưu bài" : "Thêm bài"}
            </button>
          ) : null}
          <button type="button" className="c-btn" onClick={onClose}>
            Đóng
          </button>
          {canManage && item ? (
            <button
              type="button"
              className="c-btn"
              style={{ color: "var(--err)" }}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await actions.remove({ id: item.id });
                  toast(r.message, r.ok ? "ok" : "err");
                  if (r.ok) {
                    onClose();
                    router.refresh();
                  }
                })
              }
            >
              Xóa bài
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
