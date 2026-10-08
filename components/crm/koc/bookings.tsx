"use client";

import { Clapperboard } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { formatMoney, formatMoneyShort } from "@/lib/format";
import { KOC_MANAGE } from "@/lib/koc/actions";
import {
  BOOKING_FLOW,
  BOOKING_LABEL,
  BOOKING_TONE,
  BUDGET_LIMIT,
  FORMAT_LABEL,
  NEXT_ACTION,
  PLATFORM_LABEL,
  engagements,
  formatFollowers,
  nextStatus,
  stepBlocker,
} from "@/lib/koc/logic";
import type { Booking, ContentFormat, Platform } from "@/lib/koc/types";

import { PageHead, Steps } from "../parts";
import { Field } from "./list";
import { useKoc } from "./provider";

// Booking KOL, KOC: đề xuất → (duyệt ngân sách nếu vượt mức) → chốt → gửi hàng mẫu → duyệt kịch bản → đăng →
// nghiệm thu → thanh toán. Mỗi bước có điều kiện (lib/koc/logic.ts) và kiểm quyền (lib/koc/actions.ts).

const input = "rounded-control border border-line bg-surface px-2 py-1";
const PRODUCTS = [
  "Ghế massage DV-X9",
  "Ghế massage DV-S7",
  "Ghế massage DV-M5",
  "Máy lọc nước ion kiềm DV-I3",
  "Máy lọc nước RO DV-R10",
  "Máy massage chân DV-F2",
  "Bộ lõi lọc thay thế",
  "Gối massage cổ",
];

const part = (iso: string, tz: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: tz,
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.day}/${p.month}`, time: `${p.hour}:${p.minute}` };
};

/** Giờ đăng theo giờ VN "10/10 18:00"; khán giả ở Hàn thêm dòng "20:00 giờ Hàn" (DESIGN.md 9). */
export function PostTime({ iso, audience }: { iso: string; audience: "VN" | "KR" }) {
  const vn = part(iso, "Asia/Ho_Chi_Minh");
  return (
    <>
      <span className="whitespace-nowrap">
        {vn.date} {vn.time}
      </span>
      {audience === "KR" ? (
        <span className="c-lbl block whitespace-nowrap">{part(iso, "Asia/Seoul").time} giờ Hàn</span>
      ) : null}
    </>
  );
}

const vnDateTime = (iso: string) => {
  const p = part(iso, "Asia/Ho_Chi_Minh");
  return `${p.date} ${p.time}`;
};

const STEP_LABELS = BOOKING_FLOW.map((s) => BOOKING_LABEL[s]);

export function KocBookings() {
  const { data, who } = useKoc();
  const [filter, setFilter] = useState<"open" | "budget" | "done" | "all">("open");
  const [adding, setAdding] = useState(false);
  const canManage = !who.readOnly && who.perms.has(KOC_MANAGE);

  const counts = {
    budget: data.bookings.filter((b) => b.status === "budget_pending").length,
    upcoming: data.bookings.filter((b) => ["confirmed", "sample_sent", "script_approved"].includes(b.status))
      .length,
    accept: data.bookings.filter((b) => b.status === "posted").length,
    unpaid: data.bookings.filter((b) => b.status === "accepted").length,
  };
  const rows = data.bookings
    .filter((b) =>
      filter === "all"
        ? true
        : filter === "budget"
          ? b.status === "budget_pending"
          : filter === "done"
            ? b.status === "paid" || b.status === "cancelled"
            : b.status !== "paid" && b.status !== "cancelled",
    )
    .sort((a, b) => a.postAt.localeCompare(b.postAt));

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead icon={Clapperboard} color="var(--obj-lead)" kicker="KOL, KOC" title="Booking">
          {canManage ? (
            <button type="button" className="c-btn is-blue" onClick={() => setAdding((v) => !v)}>
              Đặt booking
            </button>
          ) : null}
        </PageHead>
        <div className="c-kpis">
          <div>
            <span className="c-lbl">Chờ duyệt ngân sách</span>
            <strong className={counts.budget ? "text-warn" : ""}>{counts.budget}</strong>
          </div>
          <div>
            <span className="c-lbl">Đang chuẩn bị đăng</span>
            <strong>{counts.upcoming}</strong>
          </div>
          <div>
            <span className="c-lbl">Chờ nghiệm thu</span>
            <strong>{counts.accept}</strong>
          </div>
          <div>
            <span className="c-lbl">Chờ thanh toán</span>
            <strong>{counts.unpaid}</strong>
          </div>
        </div>
      </section>

      {adding ? <BookingForm onDone={() => setAdding(false)} /> : null}

      <section className="c-card" aria-label="Danh sách booking">
        <div className="c-cb flex flex-wrap gap-1.5" role="group" aria-label="Lọc booking">
          {(
            [
              ["open", "Đang chạy"],
              ["budget", "Chờ duyệt ngân sách"],
              ["done", "Đã xong, đã hủy"],
              ["all", "Tất cả"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              className={`c-pill ${filter === k ? "is-info" : "is-n"}`}
              onClick={() => setFilter(k)}
            >
              {l}
            </button>
          ))}
        </div>
        <BookingList bookings={rows} showCreator />
      </section>
    </div>
  );
}

/** Danh sách booking, mỗi dòng mở ra được để làm bước tiếp theo. Dùng ở màn Booking và hồ sơ KOL, KOC. */
export function BookingList({ bookings, showCreator }: { bookings: Booking[]; showCreator?: boolean }) {
  const { data } = useKoc();
  const [open, setOpen] = useState<string | null>(null);
  if (!bookings.length)
    return <p className="c-empty">Chưa có booking nào ở mục này. Bấm Đặt booking để đề xuất bài mới.</p>;
  return (
    <ul className="m-0 list-none p-0" aria-label="Booking">
      {bookings.map((b) => {
        const c = data.creators.find((x) => x.id === b.creatorId);
        const views = b.posts.reduce((s, p) => s + p.views, 0);
        const isOpen = open === b.id;
        return (
          <li key={b.id} className="border-t border-line-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <span className="min-w-0 flex-1 basis-56">
                <b>{b.campaign}</b>
                <span className="c-lbl block">
                  {showCreator && c ? (
                    <>
                      <Link href={`/kol/${c.id}`} className="c-link">
                        {c.name}
                      </Link>
                      {", "}
                    </>
                  ) : null}
                  {FORMAT_LABEL[b.format]}
                  {b.products.length ? `, ${b.products.join(", ")}` : ""}
                </span>
              </span>
              <span className="tabular basis-40">
                <PostTime iso={b.postAt} audience={c?.audience ?? "VN"} />
                <span className="c-lbl block">
                  {views ? `${formatFollowers(views)} lượt xem` : "Chưa có bài"}
                </span>
              </span>
              <span className="tabular basis-24 text-right">{formatMoneyShort(b.fee)}</span>
              <span className={`c-pill ${BOOKING_TONE[b.status]}`}>{BOOKING_LABEL[b.status]}</span>
              <button
                type="button"
                className="c-btn"
                aria-expanded={isOpen}
                aria-label={`${isOpen ? "Thu gọn" : "Mở"} booking ${b.campaign}`}
                onClick={() => setOpen(isOpen ? null : b.id)}
              >
                {isOpen ? "Thu gọn" : "Mở"}
              </button>
            </div>
            {isOpen ? <BookingPanel booking={b} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function BookingPanel({ booking: b }: { booking: Booking }) {
  const { data, act, can, staffName } = useKoc();
  const to = nextStatus(b);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const step = b.status === "cancelled" ? -1 : BOOKING_FLOW.indexOf(b.status);
  const samples = data.samples.filter((s) => s.bookingId === b.id);
  const paid = data.payouts
    .filter((p) => p.bookingId === b.id && p.kind === "fee")
    .reduce((s, p) => s + p.amount, 0);
  const advance = { type: "advanceBooking" as const, id: b.id };
  const nextLabel =
    b.status === "budget_pending"
      ? "Duyệt ngân sách và chốt"
      : to
        ? (NEXT_ACTION[to] ?? "Chuyển bước")
        : null;

  return (
    <div
      className="space-y-3 bg-surface-2 px-4 py-3"
      aria-label={`Chi tiết booking ${b.campaign}`}
      role="region"
    >
      {b.status === "cancelled" ? (
        <p className="m-0 text-err">Đã hủy: {b.cancelReason}</p>
      ) : (
        <Steps labels={STEP_LABELS} current={step} />
      )}
      <dl className="m-0 grid gap-x-6 gap-y-1 sm:grid-cols-3">
        <div>
          <dt className="c-lbl">Chi phí</dt>
          <dd className="m-0 tabular">
            {formatMoney(b.fee)}
            {b.fee > BUDGET_LIMIT ? " (vượt hạn mức, cần Owner duyệt)" : ""}
          </dd>
        </div>
        <div>
          <dt className="c-lbl">Hoa hồng trên đơn hoàn tất</dt>
          <dd className="m-0">{b.commissionRate}%</dd>
        </div>
        <div>
          <dt className="c-lbl">Đã trả phí</dt>
          <dd className="m-0 tabular">
            {formatMoney(paid)} trên {formatMoney(b.fee)}
          </dd>
        </div>
        <div>
          <dt className="c-lbl">Người đề xuất</dt>
          <dd className="m-0">{staffName(b.createdBy)}</dd>
        </div>
        <div>
          <dt className="c-lbl">Người duyệt ngân sách</dt>
          <dd className="m-0">{b.approvedBy ? staffName(b.approvedBy) : "Không cần hoặc chưa duyệt"}</dd>
        </div>
        <div>
          <dt className="c-lbl">Hàng mẫu</dt>
          <dd className="m-0">
            {samples.length
              ? samples.map((s) => `${s.product}${s.serial ? ` (${s.serial})` : ""}`).join(", ")
              : b.products.length
                ? "Chưa gửi"
                : "Không cần"}
          </dd>
        </div>
      </dl>
      {b.note ? <p className="m-0">Ghi chú: {b.note}</p> : null}

      {b.posts.length ? (
        <div className="c-tw">
          <table className="c-table">
            <thead>
              <tr>
                <th>Bài đã đăng</th>
                <th className="text-right">Lượt xem</th>
                <th className="text-right">Tương tác</th>
              </tr>
            </thead>
            <tbody>
              {b.posts.map((p) => (
                <tr key={p.url}>
                  <td>
                    <a href={p.url} target="_blank" rel="noreferrer" className="c-link">
                      {PLATFORM_LABEL[p.platform]}, {vnDateTime(p.postedAt)}
                    </a>
                  </td>
                  <td className="text-right tabular">{p.views.toLocaleString("vi-VN")}</td>
                  <td className="text-right tabular">{engagements(p).toLocaleString("vi-VN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {nextLabel && can(advance) ? (
          <button
            type="button"
            className="c-btn is-go"
            onClick={() => act(advance, `${b.campaign}: ${BOOKING_LABEL[to!]}`)}
          >
            {nextLabel}
          </button>
        ) : nextLabel && b.status !== "budget_pending" ? (
          <BlockedNext booking={b} />
        ) : b.status === "budget_pending" ? (
          <span className="c-lbl self-center">Đang chờ Owner duyệt ngân sách.</span>
        ) : null}
        {can({ type: "cancelBooking", id: b.id, reason: "x" }) && !cancelling ? (
          <button type="button" className="c-btn text-err" onClick={() => setCancelling(true)}>
            Hủy booking
          </button>
        ) : null}
      </div>
      {cancelling ? (
        <form
          className="flex flex-wrap items-end gap-2"
          aria-label="Hủy booking"
          onSubmit={(e) => {
            e.preventDefault();
            if (act({ type: "cancelBooking", id: b.id, reason }, `Đã hủy booking ${b.campaign}`))
              setCancelling(false);
          }}
        >
          <Field label="Lý do hủy" wide>
            <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} required />
          </Field>
          <button type="submit" className="c-btn text-err">
            Hủy booking này
          </button>
          <button type="button" className="c-btn" onClick={() => setCancelling(false)}>
            Giữ booking
          </button>
        </form>
      ) : null}

      {["confirmed", "sample_sent"].includes(b.status) && b.products.length ? (
        <SampleForm booking={b} />
      ) : null}
      {["script_approved", "posted"].includes(b.status) ? <PostForm booking={b} /> : null}
      {b.status === "accepted" && paid < b.fee ? <PayoutForm booking={b} remaining={b.fee - paid} /> : null}
    </div>
  );
}

/** Nút bước tiếp bị chặn: nói rõ vì sao thay cho nút xám (DESIGN.md 2, điều 4). */
function BlockedNext({ booking: b }: { booking: Booking }) {
  const { data, who } = useKoc();
  const to = nextStatus(b);
  if (!to || who.readOnly || !who.perms.has(KOC_MANAGE)) return null;
  const why = stepBlocker(data, b, to);
  return why ? <span className="c-lbl self-center">Bước tiếp: {why}</span> : null;
}

function SampleForm({ booking: b }: { booking: Booking }) {
  const { act, can } = useKoc();
  const [product, setProduct] = useState(b.products[0] ?? "");
  const [serial, setSerial] = useState("");
  if (!can({ type: "sendSample", bookingId: b.id, product: product || "x", serial: null })) return null;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      aria-label="Ghi hàng mẫu"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          act(
            { type: "sendSample", bookingId: b.id, product, serial: serial || null },
            `Đã ghi gửi mẫu ${product}`,
          )
        )
          setSerial("");
      }}
    >
      <Field label="Sản phẩm gửi mẫu">
        <select className={input} value={product} onChange={(e) => setProduct(e.target.value)}>
          {b.products.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </Field>
      <Field label="Số serial (nếu có)">
        <input className={input} value={serial} onChange={(e) => setSerial(e.target.value)} />
      </Field>
      <button type="submit" className="c-btn">
        Ghi gửi hàng mẫu
      </button>
    </form>
  );
}

function PostForm({ booking: b }: { booking: Booking }) {
  const { act, data } = useKoc();
  const c = data.creators.find((x) => x.id === b.creatorId);
  const [f, setF] = useState({
    url: "",
    platform: (c?.channels[0]?.platform ?? "tiktok") as Platform,
    views: "",
    likes: "",
    comments: "",
    shares: "",
  });
  const n = (v: string) => Number(v.replace(/\D/g, "")) || 0;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6"
      aria-label="Ghi bài đã đăng"
      onSubmit={(e) => {
        e.preventDefault();
        const ok = act(
          {
            type: "addPost",
            bookingId: b.id,
            post: {
              url: f.url.trim(),
              platform: f.platform,
              postedAt: new Date().toISOString(),
              views: n(f.views),
              likes: n(f.likes),
              comments: n(f.comments),
              shares: n(f.shares),
            },
          },
          "Đã ghi bài đã đăng",
        );
        if (ok) setF({ ...f, url: "", views: "", likes: "", comments: "", shares: "" });
      }}
    >
      <Field label="Link bài" wide>
        <input className={input} value={f.url} onChange={set("url")} placeholder="https://" required />
      </Field>
      <Field label="Nền tảng">
        <select className={input} value={f.platform} onChange={set("platform")}>
          {Object.entries(PLATFORM_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Lượt xem">
        <input className={input} inputMode="numeric" value={f.views} onChange={set("views")} />
      </Field>
      <Field label="Thích">
        <input className={input} inputMode="numeric" value={f.likes} onChange={set("likes")} />
      </Field>
      <Field label="Bình luận, chia sẻ">
        <input className={input} inputMode="numeric" value={f.comments} onChange={set("comments")} />
      </Field>
      <div className="sm:col-span-3 lg:col-span-6">
        <button type="submit" className="c-btn">
          Lưu bài đã đăng
        </button>
      </div>
    </form>
  );
}

function PayoutForm({ booking: b, remaining }: { booking: Booking; remaining: number }) {
  const { act, can } = useKoc();
  const [amount, setAmount] = useState(String(remaining));
  const [reference, setReference] = useState("");
  const draft = { creatorId: b.creatorId, bookingId: b.id, kind: "fee" as const, amount: 1, reference: "x" };
  if (!can({ type: "recordPayout", payout: draft })) return null;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      aria-label="Ghi tiền đã trả"
      onSubmit={(e) => {
        e.preventDefault();
        const value = Number(amount.replace(/\D/g, ""));
        if (
          act(
            { type: "recordPayout", payout: { ...draft, amount: value, reference } },
            `Đã ghi trả ${formatMoney(value)}`,
          )
        )
          setReference("");
      }}
    >
      <Field label="Số tiền đã trả (đồng)">
        <input
          className={input}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field label="Mã giao dịch, nội dung chuyển khoản">
        <input className={input} value={reference} onChange={(e) => setReference(e.target.value)} />
      </Field>
      <button type="submit" className="c-btn">
        Ghi tiền đã trả
      </button>
    </form>
  );
}

export function BookingForm({ onDone, creatorId }: { onDone: () => void; creatorId?: string }) {
  const { data, act } = useKoc();
  const choices = data.creators.filter((c) => c.status !== "paused" && c.status !== "ended");
  const [f, setF] = useState({
    creatorId: creatorId ?? choices[0]?.id ?? "",
    campaign: "",
    format: "short_video" as ContentFormat,
    date: "2026-10-15",
    time: "20:00",
    fee: "",
    commission: "",
    note: "",
    products: [] as string[],
  });
  const c = data.creators.find((x) => x.id === f.creatorId);
  const defaultFee = c?.rates.find((r) => r.format === f.format)?.price;
  const fee = f.fee ? Math.round(Number(f.fee.replace(",", ".")) * 1_000_000) : (defaultFee ?? 0);
  const commission = f.commission !== "" ? Number(f.commission) : (c?.contract?.commissionRate ?? 0);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const statusHint = useMemo(
    () =>
      fee > BUDGET_LIMIT
        ? `Trên ${formatMoneyShort(BUDGET_LIMIT)}: booking sẽ chờ Owner duyệt ngân sách trước khi chốt.`
        : "Trong hạn mức: chốt được ngay sau khi đề xuất.",
    [fee],
  );

  return (
    <form
      className="c-card c-cb"
      aria-label="Đặt booking"
      onSubmit={(e) => {
        e.preventDefault();
        const ok = act(
          {
            type: "addBooking",
            booking: {
              creatorId: f.creatorId,
              campaign: f.campaign.trim(),
              products: f.products,
              format: f.format,
              postAt: new Date(`${f.date}T${f.time}:00+07:00`).toISOString(),
              fee,
              commissionRate: commission,
              note: f.note.trim(),
            },
          },
          `Đã đề xuất booking ${f.campaign.trim()}`,
        );
        if (ok) onDone();
      }}
    >
      <b>Đặt booking</b>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="KOL, KOC">
          <select
            className={input}
            value={f.creatorId}
            onChange={set("creatorId")}
            disabled={Boolean(creatorId)}
          >
            {choices.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Chiến dịch">
          <input className={input} value={f.campaign} onChange={set("campaign")} required maxLength={120} />
        </Field>
        <Field label="Loại nội dung">
          <select className={input} value={f.format} onChange={set("format")}>
            {Object.entries(FORMAT_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ngày đăng">
          <input type="date" className={input} value={f.date} onChange={set("date")} required />
        </Field>
        <Field label="Giờ đăng (giờ VN)">
          <input type="time" className={input} value={f.time} onChange={set("time")} required />
        </Field>
        <Field label="Chi phí (triệu)">
          <input
            className={input}
            inputMode="decimal"
            value={f.fee}
            placeholder={defaultFee ? String(defaultFee / 1_000_000) : "0"}
            onChange={set("fee")}
          />
        </Field>
        <Field label="Hoa hồng (%)">
          <input
            className={input}
            inputMode="decimal"
            value={f.commission}
            placeholder={String(c?.contract?.commissionRate ?? 0)}
            onChange={set("commission")}
          />
        </Field>
        <Field label="Ghi chú">
          <input className={input} value={f.note} onChange={set("note")} maxLength={500} />
        </Field>
      </div>
      <fieldset className="m-0 mt-3 min-w-0 border-0 p-0">
        <legend className="c-lbl mb-1">Sản phẩm trong bài (gửi hàng mẫu)</legend>
        <div className="flex flex-wrap gap-1">
          {PRODUCTS.map((p) => {
            const on = f.products.includes(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                className={`c-pill ${on ? "is-info" : "is-n"}`}
                onClick={() =>
                  setF({ ...f, products: on ? f.products.filter((x) => x !== p) : [...f.products, p] })
                }
              >
                {p}
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="c-lbl mb-0 mt-2">
        {formatMoney(fee)}, hoa hồng {commission}%. {statusHint}
      </p>
      <div className="mt-3 flex gap-1.5">
        <button type="submit" className="c-btn is-go">
          Đề xuất booking
        </button>
        <button type="button" className="c-btn" onClick={onDone}>
          Hủy
        </button>
      </div>
    </form>
  );
}
