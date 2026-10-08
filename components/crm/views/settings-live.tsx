"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  CATALOGS,
  CHANNEL_LABEL,
  DAY_LABEL,
  MARKET_CHANNELS,
  toVnRange,
  type CatalogTable,
} from "@/lib/settings/config";

// Cài đặt Phân lead, Thị trường, Danh mục trên bản thật (CLAUDE.md 11.2). Lưu bằng server action, quyền thật ở
// RLS; mỗi thay đổi ghi nhật ký kiểm toán ở database.

type Result = { ok: boolean; message: string };
const input = "rounded-control border border-line bg-surface px-2 py-1";

function useRun() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, run };
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="c-card" aria-label={title}>
      <div className="c-ch">
        <h2>{title}</h2>
        {note ? <span className="c-r c-lbl">{note}</span> : null}
      </div>
      <div className="c-cb">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Phân lead
// ---------------------------------------------------------------------------

export function AssignmentLive({
  rules,
  onDuty,
  readOnly,
  save,
}: {
  rules: { slaMinutes: number; maxUncontacted: number };
  onDuty: string[] | null;
  readOnly: boolean;
  save: (i: { slaMinutes: number; maxUncontacted: number }) => Promise<Result>;
}) {
  const { pending, run } = useRun();
  const [sla, setSla] = useState(String(rules.slaMinutes));
  const [max, setMax] = useState(String(rules.maxUncontacted));
  const dirty = Number(sla) !== rules.slaMinutes || Number(max) !== rules.maxUncontacted;
  return (
    <div className="c-stack">
      <Card title="Phân lead" note="Chế độ tháng 1: vòng tròn">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => save({ slaMinutes: Number(sla), maxUncontacted: Number(max) }));
          }}
        >
          <p className="m-0">
            Lead mới chia vòng tròn cho người có quyền <b>Được phân lead</b>, đang bật Trực và không nghỉ hôm
            nay. Lead đến ngoài khung gọi của thị trường khách thì chờ tới đầu khung mới giao; lead đang chờ
            không tính vào giới hạn. Quá hạn mà chưa liên hệ thì người giữ lead và người điều phối được báo
            trên chuông và Telegram.
          </p>
          <label className="flex flex-wrap items-center gap-2">
            Gọi lần đầu trong
            <input
              aria-label="Hạn gọi lần đầu (phút)"
              type="number"
              min={1}
              max={1440}
              value={sla}
              disabled={readOnly}
              onChange={(e) => setSla(e.target.value)}
              className={`${input} w-20`}
            />
            phút sau khi lead được giao
          </label>
          <label className="flex flex-wrap items-center gap-2">
            Bỏ qua người đang giữ quá
            <input
              aria-label="Giới hạn lead chưa gọi mỗi người"
              type="number"
              min={1}
              max={500}
              value={max}
              disabled={readOnly}
              onChange={(e) => setMax(e.target.value)}
              className={`${input} w-20`}
            />
            lead chưa liên hệ
          </label>
          {readOnly ? null : (
            <button type="submit" className="c-btn is-go" disabled={!dirty || pending}>
              Lưu luật phân lead
            </button>
          )}
        </form>
      </Card>
      <Card title="Người đang nhận lead">
        {onDuty === null ? (
          <p className="m-0 text-text-weak">Cần quyền xem giờ trực của đội để thấy ai đang trực.</p>
        ) : onDuty.length ? (
          <p className="m-0">
            Đang bật Trực: <b>{onDuty.join(", ")}</b>.
          </p>
        ) : (
          <p className="m-0 text-warn">
            Chưa ai bật Trực. Lead mới sẽ nằm ở hàng Chưa phân cho tới khi có người bật Trực.
          </p>
        )}
        <p className="c-lbl mb-0 mt-1">
          Xếp người vào ca ở{" "}
          <Link href="/settings/shifts" className="c-link">
            Cài đặt, Ca trực
          </Link>
          ; ai được nhận lead đặt ở quyền <b>Được phân lead</b> trong Phân quyền.
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thị trường
// ---------------------------------------------------------------------------

export interface MarketRow {
  id?: string;
  countryCode: string;
  name: string;
  timezone: string;
  callWindows: { days: number[]; start: string; end: string }[];
  allowedChannels: string[];
  isActive: boolean;
}

export function MarketsLive({
  markets,
  readOnly,
  now,
  save,
}: {
  markets: MarketRow[];
  readOnly: boolean;
  now: string;
  save: (m: MarketRow) => Promise<Result>;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="c-stack">
      <section className="c-card c-cb">
        <h2 className="m-0 text-card-title font-bold">Thị trường</h2>
        <p className="c-lbl mb-0 mt-1">
          Thị trường là nơi khách đang sống. Khung gọi tốt khai theo giờ địa phương của khách; lead đến ngoài
          khung thì chờ tới đầu khung mới giao. Thêm thị trường mới không cần sửa code.
        </p>
      </section>
      {markets.map((m) => (
        <MarketCard key={m.id} market={m} readOnly={readOnly} now={now} save={save} />
      ))}
      {adding ? (
        <MarketCard
          market={{
            countryCode: "",
            name: "",
            timezone: "",
            callWindows: [{ days: [1, 2, 3, 4, 5], start: "19:00", end: "22:00" }],
            allowedChannels: ["call", "zalo_oa"],
            isActive: true,
          }}
          readOnly={readOnly}
          now={now}
          save={save}
          onDone={() => setAdding(false)}
        />
      ) : readOnly ? null : (
        <div>
          <button
            type="button"
            className="c-btn inline-flex items-center gap-1"
            onClick={() => setAdding(true)}
          >
            <Plus size={15} aria-hidden /> Thêm thị trường
          </button>
        </div>
      )}
    </div>
  );
}

function MarketCard({
  market,
  readOnly,
  now,
  save,
  onDone,
}: {
  market: MarketRow;
  readOnly: boolean;
  now: string;
  save: (m: MarketRow) => Promise<Result>;
  onDone?: () => void;
}) {
  const { pending, run } = useRun();
  const [m, setM] = useState(market);
  const isNew = !market.id;
  const label = market.name || "Thị trường mới";
  const dirty = JSON.stringify(m) !== JSON.stringify(market);
  const setWindow = (i: number, patch: Partial<MarketRow["callWindows"][number]>) =>
    setM({ ...m, callWindows: m.callWindows.map((w, k) => (k === i ? { ...w, ...patch } : w)) });
  const vnRange = (w: MarketRow["callWindows"][number]) => {
    try {
      return toVnRange(w.start, w.end, m.timezone, new Date(now));
    } catch {
      return null;
    }
  };

  return (
    <section className="c-card c-cb" aria-label={label}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="c-lbl">Tên</span>
          <input
            className={input}
            value={m.name}
            disabled={readOnly}
            onChange={(e) => setM({ ...m, name: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="c-lbl">Mã quốc gia</span>
          <input
            className={`${input} w-20`}
            value={m.countryCode}
            maxLength={2}
            disabled={readOnly || !isNew}
            onChange={(e) => setM({ ...m, countryCode: e.target.value.toUpperCase() })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="c-lbl">Múi giờ</span>
          <input
            className={input}
            value={m.timezone}
            placeholder="Asia/Tokyo"
            disabled={readOnly}
            onChange={(e) => setM({ ...m, timezone: e.target.value.trim() })}
          />
        </label>
        <label className="flex items-center gap-1.5 pb-1">
          <Switch
            label={`Dùng thị trường ${label}`}
            checked={m.isActive}
            disabled={readOnly || m.countryCode === "VN"}
            onCheckedChange={(v) => setM({ ...m, isActive: v })}
          />
          <span>{m.isActive ? "Đang dùng" : "Tạm tắt"}</span>
        </label>
      </div>

      <div className="mt-3" role="group" aria-label={`${label}: khung gọi tốt`}>
        <span className="c-lbl">Khung gọi tốt (giờ địa phương của khách)</span>
        {m.callWindows.map((w, i) => {
          const vn = m.timezone !== "Asia/Ho_Chi_Minh" ? vnRange(w) : null;
          return (
            <div
              key={i}
              className="mt-1 flex flex-wrap items-center gap-2 border-t border-line-2 py-2 first:border-t-0"
            >
              <span className="flex flex-wrap gap-1">
                {DAY_LABEL.map(([d, l]) => {
                  const on = w.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      aria-label={`Khung ${i + 1} ${l}`}
                      disabled={readOnly}
                      className={`c-pill ${on ? "is-info" : "is-n"}`}
                      onClick={() =>
                        setWindow(i, { days: on ? w.days.filter((x) => x !== d) : [...w.days, d] })
                      }
                    >
                      {l}
                    </button>
                  );
                })}
              </span>
              <input
                type="time"
                aria-label={`Khung ${i + 1} bắt đầu`}
                className={input}
                value={w.start}
                disabled={readOnly}
                onChange={(e) => setWindow(i, { start: e.target.value })}
              />
              <span>đến</span>
              <input
                type="time"
                aria-label={`Khung ${i + 1} kết thúc`}
                className={input}
                value={w.end}
                disabled={readOnly}
                onChange={(e) => setWindow(i, { end: e.target.value })}
              />
              {vn ? <span className="c-lbl">tức {vn} giờ VN</span> : null}
              {readOnly ? null : (
                <button
                  type="button"
                  className="c-ib"
                  aria-label={`Bỏ khung ${i + 1}`}
                  onClick={() => setM({ ...m, callWindows: m.callWindows.filter((_, k) => k !== i) })}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          );
        })}
        {!m.callWindows.length ? (
          <p className="m-0 mt-1 text-text-weak">
            Không có khung: lead của thị trường này được giao ngay, không chờ.
          </p>
        ) : null}
        {readOnly ? null : (
          <button
            type="button"
            className="c-btn mt-1"
            onClick={() =>
              setM({ ...m, callWindows: [...m.callWindows, { days: [6, 7], start: "09:00", end: "21:00" }] })
            }
          >
            Thêm khung gọi
          </button>
        )}
      </div>

      <fieldset className="m-0 mt-3 min-w-0 border-0 p-0">
        <legend className="c-lbl mb-1">Kênh được phép liên lạc</legend>
        <div className="flex flex-wrap gap-3">
          {MARKET_CHANNELS.map((ch) => (
            <label key={ch} className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={m.allowedChannels.includes(ch)}
                disabled={readOnly}
                onChange={(e) =>
                  setM({
                    ...m,
                    allowedChannels: e.target.checked
                      ? [...m.allowedChannels, ch]
                      : m.allowedChannels.filter((x) => x !== ch),
                  })
                }
              />
              {CHANNEL_LABEL[ch]}
            </label>
          ))}
        </div>
        <p className="c-lbl mb-0 mt-1">Tin ZNS chỉ gửi được tới số Việt Nam.</p>
      </fieldset>

      {!readOnly && (dirty || isNew) ? (
        <div className="mt-3 flex gap-1.5">
          <button
            type="button"
            className="c-btn is-go"
            disabled={pending}
            onClick={() => run(() => save(m), onDone)}
          >
            {isNew ? "Thêm thị trường" : `Lưu ${market.name}`}
          </button>
          <button type="button" className="c-btn" onClick={() => (isNew ? onDone?.() : setM(market))}>
            Hủy
          </button>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Danh mục
// ---------------------------------------------------------------------------

export interface CatalogRow {
  id: string;
  key: string;
  label: string;
  sort: number;
  isActive: boolean;
}

export function CatalogLive({
  catalogs,
  manage,
  actions,
}: {
  catalogs: Record<CatalogTable, CatalogRow[]>;
  manage: boolean;
  actions: {
    save(i: { table: CatalogTable; id?: string; label: string; isActive: boolean }): Promise<Result>;
    move(i: { table: CatalogTable; id: string; dir: "up" | "down" }): Promise<Result>;
  };
}) {
  const { pending, run } = useRun();
  const [tab, setTab] = useState<CatalogTable>("lead_sources");
  const [label, setLabel] = useState("");
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const items = catalogs[tab];
  const title = CATALOGS[tab];

  return (
    <Card title="Danh mục tra cứu" note="Ẩn mục cũ thay vì xóa để giữ lịch sử">
      <div className="c-ftabs mb-3" role="tablist">
        {(Object.keys(CATALOGS) as CatalogTable[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className="c-ftab"
            onClick={() => {
              setTab(k);
              setEditing(null);
            }}
          >
            {CATALOGS[k]}
          </button>
        ))}
      </div>
      <ul className="m-0 list-none p-0" aria-label={title}>
        {items.map((it, i) => (
          <li
            key={it.id}
            className="flex flex-wrap items-center gap-2 border-t border-line-2 py-1.5 first:border-t-0"
          >
            {editing?.id === it.id ? (
              <form
                className="flex min-w-0 flex-1 gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () =>
                      actions.save({ table: tab, id: it.id, label: editing.label, isActive: it.isActive }),
                    () => setEditing(null),
                  );
                }}
              >
                <input
                  aria-label={`Đổi tên ${it.label}`}
                  className={`${input} min-w-0 flex-1`}
                  value={editing.label}
                  maxLength={80}
                  onChange={(e) => setEditing({ id: it.id, label: e.target.value })}
                />
                <button type="submit" className="c-btn is-go" disabled={pending}>
                  Lưu tên
                </button>
                <button type="button" className="c-btn" onClick={() => setEditing(null)}>
                  Hủy
                </button>
              </form>
            ) : (
              <span className={`min-w-0 flex-1 ${it.isActive ? "" : "text-text-weak line-through"}`}>
                {it.label}
              </span>
            )}
            {manage && editing?.id !== it.id ? (
              <>
                <button
                  type="button"
                  className="c-ib"
                  aria-label={`Đưa ${it.label} lên`}
                  disabled={pending || i === 0}
                  onClick={() => run(() => actions.move({ table: tab, id: it.id, dir: "up" }))}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="c-ib"
                  aria-label={`Đưa ${it.label} xuống`}
                  disabled={pending || i === items.length - 1}
                  onClick={() => run(() => actions.move({ table: tab, id: it.id, dir: "down" }))}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  className="c-btn"
                  onClick={() => setEditing({ id: it.id, label: it.label })}
                >
                  Đổi tên
                </button>
                <Switch
                  label={`Dùng ${it.label}`}
                  checked={it.isActive}
                  disabled={pending}
                  onCheckedChange={(v) =>
                    run(() => actions.save({ table: tab, id: it.id, label: it.label, isActive: v }))
                  }
                />
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {manage ? (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const v = label.trim();
            if (!v) return;
            run(
              () => actions.save({ table: tab, label: v, isActive: true }),
              () => setLabel(""),
            );
          }}
        >
          <input
            aria-label={`Thêm vào ${title}`}
            placeholder={`Thêm vào ${title.toLowerCase()}…`}
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            className={`${input} min-w-0 flex-1`}
          />
          <button type="submit" className="c-btn" disabled={pending}>
            Thêm
          </button>
        </form>
      ) : (
        <p className="c-lbl mb-0 mt-2">Anh chị chỉ có quyền xem danh mục.</p>
      )}
    </Card>
  );
}
