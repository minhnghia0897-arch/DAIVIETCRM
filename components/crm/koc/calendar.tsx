"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";

import { KOC_TODAY } from "@/lib/koc/data";
import { BOOKING_FLOW, BOOKING_LABEL, BOOKING_TONE, FORMAT_LABEL } from "@/lib/koc/logic";

import { PageHead } from "../parts";
import { PostTime } from "./bookings";
import { useKoc } from "./provider";

// Lịch đăng của KOL, KOC trong 3 tuần tới (giờ VN, kèm giờ Hàn khi khán giả ở Hàn), kèm việc cần chuẩn bị: gửi
// hàng mẫu, duyệt kịch bản, xếp telesale trực trong giờ live để chốt khách.

const DAY_MS = 86_400_000;
const vnDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const dayLabel = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00+07:00`);
  const diff = Math.round(
    (Date.parse(`${ymd}T00:00:00+07:00`) - Date.parse(`${KOC_TODAY}T00:00:00+07:00`)) / DAY_MS,
  );
  const name = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(d);
  return diff === 0 ? `Hôm nay, ${name}` : diff === 1 ? `Ngày mai, ${name}` : name;
};

export function KocCalendar() {
  const { data } = useKoc();
  const from = Date.parse(`${KOC_TODAY}T00:00:00+07:00`);
  const items = data.bookings
    .filter((b) => b.status !== "cancelled")
    .filter((b) => Date.parse(b.postAt) >= from - 3 * DAY_MS && Date.parse(b.postAt) < from + 21 * DAY_MS)
    .sort((a, b) => a.postAt.localeCompare(b.postAt));
  const days = [...new Set(items.map((b) => vnDay(b.postAt)))];

  const prep = (b: (typeof items)[number]): string[] => {
    const out: string[] = [];
    const step = BOOKING_FLOW.indexOf(b.status);
    const hoursLeft = (Date.parse(b.postAt) - Date.parse(`${KOC_TODAY}T09:00:00+07:00`)) / 3_600_000;
    if (b.status === "budget_pending") out.push("Chờ Owner duyệt ngân sách");
    if (b.status === "proposed") out.push("Chưa chốt booking");
    if (
      b.products.length &&
      !data.samples.some((s) => s.bookingId === b.id) &&
      step < BOOKING_FLOW.indexOf("posted")
    )
      out.push("Chưa gửi hàng mẫu");
    if (step < BOOKING_FLOW.indexOf("script_approved") && hoursLeft < 72) out.push("Chưa duyệt kịch bản");
    if (b.format === "livestream" && step < BOOKING_FLOW.indexOf("posted"))
      out.push("Xếp telesale trực trong giờ live");
    if (
      step >= BOOKING_FLOW.indexOf("script_approved") &&
      step < BOOKING_FLOW.indexOf("posted") &&
      hoursLeft < 0
    )
      out.push("Quá giờ hẹn, chưa ghi bài đã đăng");
    return out;
  };

  return (
    <div className="c-stack">
      <section className="c-card">
        <PageHead icon={CalendarDays} color="var(--obj-lead)" kicker="KOL, KOC" title="Lịch đăng" />
        <p className="c-lbl mx-4 mb-3 mt-0">
          3 ngày trước đến 3 tuần tới, giờ Việt Nam; bài cho khán giả ở Hàn ghi thêm giờ Hàn.
        </p>
      </section>
      {days.length ? (
        days.map((d) => (
          <section key={d} className="c-card" aria-label={dayLabel(d)}>
            <div className="c-ch">
              <h2>{dayLabel(d)}</h2>
            </div>
            <ul className="m-0 list-none px-4 pb-2">
              {items
                .filter((b) => vnDay(b.postAt) === d)
                .map((b) => {
                  const c = data.creators.find((x) => x.id === b.creatorId);
                  const todo = prep(b);
                  return (
                    <li
                      key={b.id}
                      className="flex flex-wrap items-start gap-3 border-t border-line-2 py-2 first:border-t-0"
                    >
                      <span className="tabular basis-28 font-semibold">
                        <PostTime iso={b.postAt} audience={c?.audience ?? "VN"} />
                      </span>
                      <span className="min-w-0 flex-1 basis-56">
                        <b>{b.campaign}</b>
                        <span className="c-lbl block">
                          {c ? (
                            <Link href={`/kol/${c.id}`} className="c-link">
                              {c.name}
                            </Link>
                          ) : null}
                          {`, ${FORMAT_LABEL[b.format]}`}
                        </span>
                        {todo.length ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {todo.map((t) => (
                              <span key={t} className="c-pill is-warn">
                                {t}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                      <span className={`c-pill ${BOOKING_TONE[b.status]}`}>{BOOKING_LABEL[b.status]}</span>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))
      ) : (
        <section className="c-card">
          <p className="c-empty">Chưa có bài nào trong 3 tuần tới. Đặt booking ở tab Booking để lên lịch.</p>
        </section>
      )}
    </div>
  );
}
