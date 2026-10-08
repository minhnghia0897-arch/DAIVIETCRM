"use client";

import { Clapperboard } from "lucide-react";
import { useState } from "react";

import { formatDate, formatDateTime, formatMoney, formatMoneyShort } from "@/lib/format";
import { LEAD_STAGE_LABEL } from "@/lib/leads/labels";
import { KOC_MANAGE, KOC_PAYOUT } from "@/lib/koc/actions";
import { KOC_TODAY } from "@/lib/koc/data";
import {
  AUDIENCE_LABEL,
  FORMAT_LABEL,
  KIND_LABEL,
  PLATFORM_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  creatorStats,
  formatFollowers,
  formatRoas,
  maxFollowers,
  tierOf,
} from "@/lib/koc/logic";
import type { Creator, PartnerStatus } from "@/lib/koc/types";

import { PageHead } from "../parts";
import { BookingForm, BookingList } from "./bookings";
import { Field } from "./list";
import { useKoc } from "./provider";

// Hồ sơ một KOL, KOC: thông tin liên hệ, kênh, bảng giá, hợp đồng, booking, lead và đơn có mã giới thiệu, hàng
// mẫu, tiền đã trả và còn nợ, đánh giá, dòng hoạt động.

const input = "rounded-control border border-line bg-surface px-2 py-1";
const CONTRACT_LABEL = { draft: "Bản nháp", signed: "Đã ký", expired: "Hết hạn" } as const;
const SAMPLE_LABEL = { with_creator: "Đang giữ", returned: "Đã thu hồi", gifted: "Tặng luôn" } as const;

export function KocProfile({ id }: { id: string }) {
  const { data, who, act, staffName } = useKoc();
  const [booking, setBooking] = useState(false);
  const c = data.creators.find((x) => x.id === id);
  if (!c)
    return (
      <section className="c-card">
        <p className="c-empty">Không tìm thấy KOL, KOC này. Có thể hồ sơ vừa được thêm ở phiên khác.</p>
      </section>
    );
  const manage = !who.readOnly && who.perms.has(KOC_MANAGE);
  const s = creatorStats(data, c.id);
  const followers = c.channels.reduce((n, ch) => n + ch.followers, 0);
  const daysLeft = c.contract
    ? Math.round((Date.parse(c.contract.endsOn) - Date.parse(KOC_TODAY)) / 86_400_000)
    : null;
  const leads = data.leads
    .filter((l) => l.creatorId === c.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const activity = data.activity.filter((a) => a.creatorId === c.id).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead
          icon={Clapperboard}
          color="var(--obj-lead)"
          kicker={KIND_LABEL[c.kind]}
          title={c.name}
          back={{ href: "/kol", label: "KOL, KOC" }}
        >
          <span className={`c-pill ${STATUS_TONE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
          {manage ? (
            <select
              aria-label="Đổi trạng thái hợp tác"
              className={input}
              value={c.status}
              onChange={(e) =>
                act(
                  { type: "setStatus", id: c.id, status: e.target.value as PartnerStatus },
                  `Đã đổi sang ${STATUS_LABEL[e.target.value as PartnerStatus]}`,
                )
              }
            >
              {Object.entries(STATUS_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          ) : null}
          {manage && c.status !== "paused" && c.status !== "ended" ? (
            <button type="button" className="c-btn is-blue" onClick={() => setBooking((v) => !v)}>
              Đặt booking
            </button>
          ) : null}
        </PageHead>
        <div className="c-hl">
          <div>
            <span className="c-lbl">Khán giả</span>
            <b>
              <span className={`c-loc ${c.audience === "KR" ? "is-kr" : "is-vn"}`}>
                {AUDIENCE_LABEL[c.audience]}
              </span>
            </b>
          </div>
          <div>
            <span className="c-lbl">Hạng</span>
            <b>{tierOf(maxFollowers(c))}</b>
          </div>
          <div>
            <span className="c-lbl">Tổng người theo dõi</span>
            <b>{formatFollowers(followers)}</b>
          </div>
          <div>
            <span className="c-lbl">Mã giới thiệu</span>
            <b className="font-semibold">{c.trackingCode}</b>
          </div>
          <div>
            <span className="c-lbl">Phụ trách</span>
            <b>{staffName(c.ownerId)}</b>
          </div>
          <div>
            <span className="c-lbl">Hợp đồng</span>
            <b className={daysLeft !== null && daysLeft <= 30 ? "text-warn" : ""}>
              {c.contract
                ? c.contract.status === "expired" || (daysLeft ?? 0) < 0
                  ? `Hết hạn ${formatDate(c.contract.endsOn)}`
                  : `Đến ${formatDate(c.contract.endsOn)}${daysLeft !== null && daysLeft <= 30 ? `, còn ${daysLeft} ngày` : ""}`
                : "Chưa ký"}
            </b>
          </div>
        </div>
        <div className="c-kpis">
          <div>
            <span className="c-lbl">Lead có mã</span>
            <strong>{s.leads}</strong>
          </div>
          <div>
            <span className="c-lbl">Đơn hoàn tất</span>
            <strong>{s.orders}</strong>
          </div>
          <div>
            <span className="c-lbl">Doanh thu</span>
            <strong>{formatMoneyShort(s.revenue)}</strong>
          </div>
          <div>
            <span className="c-lbl">Doanh thu trên chi phí</span>
            <strong>{formatRoas(s.roas)}</strong>
          </div>
        </div>
      </section>

      {booking ? <BookingForm creatorId={c.id} onDone={() => setBooking(false)} /> : null}

      <div className="c-g84">
        <div className="c-stack">
          <section className="c-card" aria-label="Booking của người này">
            <div className="c-ch">
              <h2>Booking</h2>
              <span className="c-lbl ml-auto">
                Chi phí {formatMoney(s.fees)}, hoa hồng {formatMoney(s.commission)}
              </span>
            </div>
            <BookingList
              bookings={data.bookings
                .filter((b) => b.creatorId === c.id)
                .sort((a, b) => b.postAt.localeCompare(a.postAt))}
            />
          </section>

          <section className="c-card" aria-label="Lead và đơn có mã giới thiệu">
            <div className="c-ch">
              <h2>Lead và đơn có mã {c.trackingCode}</h2>
              <span className="c-lbl ml-auto">
                {s.leads} lead, {s.deposits} đã cọc trở lên, chi phí mỗi lead{" "}
                {s.cpl ? formatMoneyShort(s.cpl) : "chưa có"}
              </span>
            </div>
            {leads.length ? (
              <div className="c-tw">
                <table className="c-table">
                  <thead>
                    <tr>
                      <th>Khách</th>
                      <th>Ngày vào</th>
                      <th>Từ booking</th>
                      <th>Giai đoạn</th>
                      <th className="text-right">Giá trị đơn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => (
                      <tr key={l.id}>
                        <td>{l.name}</td>
                        <td className="tabular">{formatDate(l.createdAt)}</td>
                        <td>
                          {l.bookingId
                            ? (data.bookings.find((b) => b.id === l.bookingId)?.campaign ?? "")
                            : "Mã giới thiệu"}
                        </td>
                        <td>
                          <span
                            className={`c-pill ${l.stage === "won" ? "is-ok" : l.stage === "lost" ? "is-err" : "is-n"}`}
                          >
                            {LEAD_STAGE_LABEL[l.stage] ?? l.stage}
                          </span>
                        </td>
                        <td className="text-right tabular">
                          {l.orderValue ? formatMoneyShort(l.orderValue) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="c-empty">
                Chưa có lead nào có mã {c.trackingCode}. Nhắc người này ghim mã hoặc link Zalo OA trong bài.
              </p>
            )}
          </section>

          <section className="c-card" aria-label="Dòng hoạt động">
            <div className="c-ch">
              <h2>Dòng hoạt động</h2>
            </div>
            {manage ? <NoteForm creatorId={c.id} /> : null}
            <ul className="m-0 list-none px-4 pb-3">
              {activity.map((a, i) => (
                <li key={i} className="flex gap-2 border-t border-line-2 py-1.5 first:border-t-0">
                  <span className="min-w-0 flex-1">
                    {a.text}
                    <span className="c-lbl block">{staffName(a.actor)}</span>
                  </span>
                  <span className="c-lbl tabular">{formatDateTime(a.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="c-stack">
          <Contact c={c} />
          <section className="c-card" aria-label="Kênh mạng xã hội">
            <div className="c-ch">
              <h2>Kênh</h2>
            </div>
            <ul className="m-0 list-none px-4 pb-3">
              {c.channels.map((ch) => (
                <li key={ch.platform + ch.handle} className="border-t border-line-2 py-2 first:border-t-0">
                  <b>{PLATFORM_LABEL[ch.platform]}</b>{" "}
                  {ch.url ? (
                    <a href={ch.url} target="_blank" rel="noreferrer" className="c-link">
                      {ch.handle}
                    </a>
                  ) : (
                    ch.handle
                  )}
                  <span className="c-lbl block">
                    {formatFollowers(ch.followers)} người theo dõi
                    {ch.avgViews ? `, xem trung bình ${formatFollowers(ch.avgViews)}` : ""}
                    {ch.engagementRate ? `, tương tác ${ch.engagementRate.toLocaleString("vi-VN")}%` : ""}
                  </span>
                  <span className="c-lbl block">Cập nhật {formatDate(ch.updatedAt)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="c-card" aria-label="Bảng giá và hợp đồng">
            <div className="c-ch">
              <h2>Bảng giá, hợp đồng</h2>
            </div>
            <div className="c-cb space-y-2">
              {c.rates.length ? (
                <table className="c-rl">
                  <tbody>
                    {c.rates.map((r) => (
                      <tr key={r.format}>
                        <td>{FORMAT_LABEL[r.format]}</td>
                        <td className="text-right tabular">{formatMoney(r.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="m-0 text-text-weak">Không nhận phí cố định, chỉ hoa hồng.</p>
              )}
              {c.contract ? (
                <dl className="m-0 space-y-1">
                  <div>
                    <dt className="c-lbl">Hợp đồng {c.contract.code}</dt>
                    <dd className="m-0">
                      <span className={`c-pill ${c.contract.status === "signed" ? "is-ok" : "is-warn"}`}>
                        {CONTRACT_LABEL[c.contract.status]}
                      </span>{" "}
                      {formatDate(c.contract.startsOn)} đến {formatDate(c.contract.endsOn)}
                    </dd>
                  </div>
                  <div>
                    <dt className="c-lbl">Hoa hồng trên đơn hoàn tất</dt>
                    <dd className="m-0">{c.contract.commissionRate}%</dd>
                  </div>
                  <div>
                    <dt className="c-lbl">Quyền dùng lại nội dung</dt>
                    <dd className="m-0">
                      {c.contract.usageRightsMonths ? `${c.contract.usageRightsMonths} tháng` : "Không có"}
                    </dd>
                  </div>
                  <div>
                    <dt className="c-lbl">Độc quyền</dt>
                    <dd className="m-0">{c.contract.exclusivity ?? "Không"}</dd>
                  </div>
                  <div>
                    <dt className="c-lbl">Tệp hợp đồng</dt>
                    <dd className="m-0">{c.contract.fileName ?? "Chưa tải lên"}</dd>
                  </div>
                </dl>
              ) : (
                <p className="m-0 text-text-weak">Chưa ký hợp đồng.</p>
              )}
            </div>
          </section>

          <Samples creatorId={c.id} />
          <Payments creatorId={c.id} />
          <RatingCard c={c} />
        </div>
      </div>
    </div>
  );
}

function Contact({ c }: { c: Creator }) {
  const { who } = useKoc();
  const [shown, setShown] = useState(false);
  return (
    <section className="c-card" aria-label="Liên hệ">
      <div className="c-ch">
        <h2>Liên hệ</h2>
      </div>
      <dl className="c-cb m-0 space-y-1">
        <div>
          <dt className="c-lbl">Tên thật</dt>
          <dd className="m-0">{c.realName || "Chưa có"}</dd>
        </div>
        <div>
          <dt className="c-lbl">Số điện thoại</dt>
          <dd className="m-0 flex items-center gap-2">
            <span className="tabular">{shown ? c.phoneFull : c.phoneMasked}</span>
            {c.zalo ? <span className="c-pill is-n">Có Zalo</span> : null}
            {!shown && who.perms.has("contact.phone_reveal") && c.phoneFull ? (
              <button type="button" className="c-btn" onClick={() => setShown(true)}>
                Hiện số
              </button>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="c-lbl">Quản lý, agency</dt>
          <dd className="m-0">{c.agency ?? "Làm việc trực tiếp"}</dd>
        </div>
        <div>
          <dt className="c-lbl">Đang sống ở</dt>
          <dd className="m-0">{c.livesIn || "Chưa rõ"}</dd>
        </div>
        <div>
          <dt className="c-lbl">Chủ đề</dt>
          <dd className="m-0">{c.niches.join(", ") || "Chưa ghi"}</dd>
        </div>
        {c.tags.length ? (
          <div>
            <dt className="c-lbl">Thẻ</dt>
            <dd className="m-0 flex flex-wrap gap-1">
              {c.tags.map((t) => (
                <span key={t} className="c-pill is-n">
                  {t}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        {c.note ? (
          <div>
            <dt className="c-lbl">Ghi chú</dt>
            <dd className="m-0">{c.note}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function Samples({ creatorId }: { creatorId: string }) {
  const { data, act, who } = useKoc();
  const samples = data.samples.filter((s) => s.creatorId === creatorId);
  const manage = !who.readOnly && who.perms.has(KOC_MANAGE);
  return (
    <section className="c-card" aria-label="Hàng mẫu">
      <div className="c-ch">
        <h2>Hàng mẫu</h2>
      </div>
      {samples.length ? (
        <ul className="m-0 list-none px-4 pb-3">
          {samples.map((s) => (
            <li key={s.id} className="border-t border-line-2 py-2 first:border-t-0">
              <span className="flex flex-wrap items-center gap-2">
                <b className="min-w-0 flex-1">{s.product}</b>
                <span className={`c-pill ${s.status === "with_creator" ? "is-warn" : "is-n"}`}>
                  {SAMPLE_LABEL[s.status]}
                </span>
              </span>
              <span className="c-lbl block">
                Gửi {formatDate(s.sentAt)}
                {s.serial ? `, serial ${s.serial}` : ""}
              </span>
              {manage && s.status === "with_creator" ? (
                <span className="mt-1 flex gap-1.5">
                  <button
                    type="button"
                    className="c-btn"
                    onClick={() =>
                      act({ type: "sampleStatus", id: s.id, status: "returned" }, "Đã ghi thu hồi hàng mẫu")
                    }
                  >
                    Ghi đã thu hồi
                  </button>
                  <button
                    type="button"
                    className="c-btn"
                    onClick={() =>
                      act({ type: "sampleStatus", id: s.id, status: "gifted" }, "Đã ghi tặng luôn hàng mẫu")
                    }
                  >
                    Tặng luôn
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="c-empty">Chưa gửi hàng mẫu nào.</p>
      )}
      <p className="c-lbl mx-4 mb-3 mt-0">
        Khi nối kho thật, gửi mẫu sinh phiếu xuất hàng trưng bày, thu hồi sinh phiếu nhập lại.
      </p>
    </section>
  );
}

function Payments({ creatorId }: { creatorId: string }) {
  const { data, act, who, staffName } = useKoc();
  const s = creatorStats(data, creatorId);
  const payouts = data.payouts.filter((p) => p.creatorId === creatorId);
  const canPay = !who.readOnly && who.perms.has(KOC_PAYOUT) && who.perms.has(KOC_MANAGE);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  return (
    <section className="c-card" aria-label="Thanh toán cho KOL, KOC">
      <div className="c-ch">
        <h2>Thanh toán</h2>
      </div>
      <dl className="c-cb m-0 grid grid-cols-2 gap-1">
        <dt className="c-lbl">Phí booking</dt>
        <dd className="m-0 text-right tabular">{formatMoney(s.fees)}</dd>
        <dt className="c-lbl">Hoa hồng đơn hoàn tất</dt>
        <dd className="m-0 text-right tabular">{formatMoney(s.commission)}</dd>
        <dt className="c-lbl">Đã trả</dt>
        <dd className="m-0 text-right tabular">{formatMoney(s.paid)}</dd>
        <dt className="font-semibold">Còn phải trả</dt>
        <dd className={`m-0 text-right font-semibold tabular ${s.owed ? "text-warn" : ""}`}>
          {formatMoney(s.owed)}
        </dd>
      </dl>
      {payouts.length ? (
        <ul className="m-0 list-none px-4 pb-2">
          {payouts.map((p) => (
            <li key={p.id} className="flex gap-2 border-t border-line-2 py-1.5">
              <span className="min-w-0 flex-1">
                {p.kind === "fee" ? "Phí booking" : "Hoa hồng"}
                <span className="c-lbl block">
                  {p.reference}, {staffName(p.recordedBy)} ghi
                </span>
              </span>
              <span className="text-right tabular">
                {formatMoneyShort(p.amount)}
                <span className="c-lbl block">{formatDate(p.paidAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {canPay && s.commission > 0 ? (
        <form
          className="c-cb flex flex-wrap items-end gap-2 border-t border-line-2"
          aria-label="Ghi trả hoa hồng"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(amount.replace(/\D/g, ""));
            const ok = act(
              {
                type: "recordPayout",
                payout: { creatorId, bookingId: null, kind: "commission", amount: value, reference },
              },
              `Đã ghi trả hoa hồng ${formatMoney(value)}`,
            );
            if (ok) {
              setAmount("");
              setReference("");
            }
          }}
        >
          <Field label="Hoa hồng đã trả (đồng)">
            <input
              className={input}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Mã giao dịch">
            <input className={input} value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <button type="submit" className="c-btn">
            Ghi trả hoa hồng
          </button>
        </form>
      ) : null}
    </section>
  );
}

function RatingCard({ c }: { c: Creator }) {
  const { act, who, staffName } = useKoc();
  const [editing, setEditing] = useState(false);
  const [r, setR] = useState({
    content: c.rating?.content ?? 4,
    punctuality: c.rating?.punctuality ?? 4,
    results: c.rating?.results ?? 4,
    note: "",
  });
  const manage = !who.readOnly && who.perms.has(KOC_MANAGE);
  const scale = (k: "content" | "punctuality" | "results", label: string) => (
    <Field label={label}>
      <select className={input} value={r[k]} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })}>
        {[5, 4, 3, 2, 1].map((n) => (
          <option key={n} value={n}>
            {n} trên 5
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <section className="c-card" aria-label="Đánh giá">
      <div className="c-ch">
        <h2>Đánh giá</h2>
        {manage && !editing ? (
          <button type="button" className="c-btn ml-auto" onClick={() => setEditing(true)}>
            Đánh giá lại
          </button>
        ) : null}
      </div>
      {c.rating ? (
        <dl className="c-cb m-0 grid grid-cols-3 gap-2">
          <div>
            <dt className="c-lbl">Nội dung</dt>
            <dd className="m-0 font-semibold">{c.rating.content}/5</dd>
          </div>
          <div>
            <dt className="c-lbl">Đúng hạn</dt>
            <dd className="m-0 font-semibold">{c.rating.punctuality}/5</dd>
          </div>
          <div>
            <dt className="c-lbl">Hiệu quả</dt>
            <dd className="m-0 font-semibold">{c.rating.results}/5</dd>
          </div>
          {c.rating.note ? <p className="col-span-3 m-0">{c.rating.note}</p> : null}
          <p className="c-lbl col-span-3 m-0">
            {staffName(c.rating.by)}, {formatDate(c.rating.at)}
          </p>
        </dl>
      ) : (
        <p className="c-empty">Chưa đánh giá. Đánh giá sau mỗi lần nghiệm thu để chọn người cho lần sau.</p>
      )}
      {editing ? (
        <form
          aria-label="Đánh giá KOL, KOC"
          className="c-cb grid grid-cols-3 gap-2 border-t border-line-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (act({ type: "rate", id: c.id, rating: r }, "Đã lưu đánh giá")) setEditing(false);
          }}
        >
          {scale("content", "Nội dung")}
          {scale("punctuality", "Đúng hạn")}
          {scale("results", "Hiệu quả")}
          <div className="col-span-3">
            <Field label="Nhận xét">
              <input
                className={input}
                value={r.note}
                onChange={(e) => setR({ ...r, note: e.target.value })}
              />
            </Field>
          </div>
          <div className="col-span-3 flex gap-1.5">
            <button type="submit" className="c-btn is-go">
              Lưu đánh giá
            </button>
            <button type="button" className="c-btn" onClick={() => setEditing(false)}>
              Hủy
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function NoteForm({ creatorId }: { creatorId: string }) {
  const { act } = useKoc();
  const [text, setText] = useState("");
  return (
    <form
      aria-label="Ghi chú về KOL, KOC"
      className="mx-4 mb-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() && act({ type: "addNote", id: creatorId, text }, "Đã lưu ghi chú")) setText("");
      }}
    >
      <input
        className={`${input} min-w-0 flex-1`}
        placeholder="Ghi chú: đã gọi, đã gửi brief, khán giả hỏi gì…"
        aria-label="Nội dung ghi chú"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="c-btn">
        Lưu ghi chú
      </button>
    </form>
  );
}
