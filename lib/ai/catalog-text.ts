import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import type { Policy } from "../sales/pricing.ts";
import { vnd } from "./prompt.ts";

// Ưu đãi, chính sách, ca trực viết thành câu cho AI (hàm thuần, kiểm thử được).

const TZ = "Asia/Ho_Chi_Minh";
const WEEKDAY = ["Chủ nhật", "thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy"];

export const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function activeOnline(p: Policy, day: string): boolean {
  if (p.status !== "active" || day < p.validFrom) return false;
  if (p.validTo && day > p.validTo) return false;
  return !p.channels || p.channels.includes("online");
}

function until(p: { validTo: string | null }) {
  return p.validTo ? ` (đến hết ${dmy(p.validTo)})` : "";
}

/** Chính sách viết thành câu cho khách hiểu; giới hạn giảm của nhân viên là nội bộ, không đưa cho AI. */
export function describePolicy(
  p: Policy,
  names: { variant: (id: string) => string; category: (id: string) => string; combo: (id: string) => string },
): string[] {
  if (p.type === "promotion") {
    const b = p.rules.benefit;
    const gains = [
      b.percentOff ? `giảm ${b.percentOff}%` : null,
      b.amountOff ? `giảm ${vnd(b.amountOff)}` : null,
      b.giftVariantIds?.length ? `tặng ${b.giftVariantIds.map(names.variant).join(", ")}` : null,
      b.freeInstallation ? "miễn phí lắp đặt" : null,
      b.freeDelivery ? "miễn phí giao hàng" : null,
    ].filter(Boolean);
    const s = p.rules.scope;
    const conds = [
      s?.variantIds?.length ? `áp cho ${s.variantIds.map(names.variant).join(", ")}` : null,
      s?.categoryIds?.length ? `áp cho nhóm ${s.categoryIds.map(names.category).join(", ")}` : null,
      s?.comboIds?.length ? `áp cho combo ${s.comboIds.map(names.combo).join(", ")}` : null,
      p.rules.minSubtotal ? `đơn từ ${vnd(p.rules.minSubtotal)}` : null,
      p.rules.buyerCountries?.length ? `người đặt sống ở ${p.rules.buyerCountries.join(", ")}` : null,
      p.rules.customerTags?.length ? `khách thuộc nhóm ${p.rules.customerTags.join(", ")}` : null,
    ].filter(Boolean);
    return [
      `Khuyến mãi "${p.name}": ${gains.join(", ")}${conds.length ? `; điều kiện: ${conds.join(", ")}` : ""}${until(p)}${p.stackable ? "" : "; không cộng dồn với khuyến mãi khác"}`,
    ];
  }
  if (p.type === "delivery")
    return p.rules.zones.map((z) => {
      const where = z.provinces === "*" ? "các tỉnh còn lại" : z.provinces.join(", ");
      const cutoff = z.cutoff ? `; chốt đơn trước ${dmy(z.cutoff.date)} để kịp ${z.cutoff.label}` : "";
      return `Giao lắp "${p.name}", ${z.label} (${where}): phí giao ${vnd(z.fee)}, phí lắp hàng cồng kềnh ${vnd(z.installation.bulky)}, hàng nhỏ ${vnd(z.installation.parcel)}, giao khoảng ${z.leadDays} ngày${cutoff}${until(p)}`;
    });
  if (p.type === "deposit")
    return [
      `Đặt cọc: tối thiểu ${vnd(p.rules.minAmount)}${p.rules.minPercent ? ` hoặc ${p.rules.minPercent}% giá trị đơn` : ""}`,
    ];
  return [];
}

/** Giờ bắt đầu ca kế tiếp (trong 7 ngày tới) viết thành chữ, ví dụ "08:30 thứ Hai 13/10". */
export function nextShiftText(shifts: { days: number[]; start_time: string }[], now: Date): string | null {
  const t = new TZDate(now, TZ);
  const today = format(t, "yyyy-MM-dd");
  const nowHm = format(t, "HH:mm");
  for (let add = 0; add < 8; add++) {
    const d = new TZDate(t.getTime() + add * 86_400_000, TZ);
    const iso = d.getDay() === 0 ? 7 : d.getDay();
    const starts = shifts
      .filter((s) => s.days.includes(iso))
      .map((s) => s.start_time.slice(0, 5))
      .filter((hm) => format(d, "yyyy-MM-dd") !== today || hm > nowHm)
      .sort();
    if (starts.length) return `${starts[0]} ${WEEKDAY[d.getDay()]} ${format(d, "dd/MM")}`;
  }
  return null;
}
