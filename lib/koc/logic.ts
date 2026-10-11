import type {
  AttributedLead,
  Booking,
  BookingStatus,
  ContentFormat,
  CreatorKind,
  KocData,
  PartnerStatus,
  Platform,
  Post,
} from "./types";

// Nhãn tiếng Việt, bước booking và chỉ số hiệu quả của KOL, KOC. Hàm thuần: nhận dữ liệu và thời điểm từ ngoài.

export const KIND_LABEL: Record<CreatorKind, string> = {
  kol: "KOL",
  koc: "KOC",
  affiliate: "Tiếp thị liên kết",
};

export const STATUS_LABEL: Record<PartnerStatus, string> = {
  prospect: "Tiềm năng",
  negotiating: "Đang đàm phán",
  active: "Đang hợp tác",
  paused: "Tạm dừng",
  ended: "Ngừng hợp tác",
};

export const STATUS_TONE: Record<PartnerStatus, string> = {
  prospect: "is-n",
  negotiating: "is-warn",
  active: "is-ok",
  paused: "is-warn",
  ended: "is-err",
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
  instagram: "Instagram",
};

export const FORMAT_LABEL: Record<ContentFormat, string> = {
  short_video: "Video ngắn",
  livestream: "Livestream",
  post: "Bài viết",
  story: "Story",
  showroom_visit: "Quay tại showroom",
};

export const AUDIENCE_LABEL = { VN: "Trong nước", KR: "Người Việt tại Hàn" } as const;

/** Thứ tự bước của một booking (bỏ qua "Chờ duyệt ngân sách" khi chi phí trong hạn mức). */
export const BOOKING_FLOW: BookingStatus[] = [
  "proposed",
  "budget_pending",
  "confirmed",
  "sample_sent",
  "script_approved",
  "posted",
  "accepted",
  "paid",
];

export const BOOKING_LABEL: Record<BookingStatus, string> = {
  proposed: "Đề xuất",
  budget_pending: "Chờ duyệt ngân sách",
  confirmed: "Đã chốt",
  sample_sent: "Đã gửi hàng mẫu",
  script_approved: "Đã duyệt kịch bản",
  posted: "Đã đăng",
  accepted: "Đã nghiệm thu",
  paid: "Đã thanh toán",
  cancelled: "Đã hủy",
};

export const BOOKING_TONE: Record<BookingStatus, string> = {
  proposed: "is-n",
  budget_pending: "is-warn",
  confirmed: "is-n",
  sample_sent: "is-n",
  script_approved: "is-n",
  posted: "is-ok",
  accepted: "is-ok",
  paid: "is-ok",
  cancelled: "is-err",
};

/** Booking có chi phí trên mức này phải chờ Owner duyệt ngân sách trước khi chốt. */
export const BUDGET_LIMIT = 10_000_000;

/** Hạng theo số người theo dõi trên kênh lớn nhất. */
export function tierOf(followers: number): string {
  if (followers < 10_000) return "Nano (dưới 10 nghìn)";
  if (followers < 50_000) return "Micro (10–50 nghìn)";
  if (followers < 200_000) return "Tầm trung (50–200 nghìn)";
  if (followers < 1_000_000) return "Macro (200 nghìn–1 triệu)";
  return "Mega (trên 1 triệu)";
}

export function maxFollowers(c: { channels: { followers: number }[] }): number {
  return Math.max(0, ...c.channels.map((ch) => ch.followers));
}

/** "48,2 nghìn", "1,2 triệu" */
export function formatFollowers(n: number): string {
  const f = (v: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(v);
  if (n >= 1_000_000) return `${f(n / 1_000_000)} triệu`;
  if (n >= 1_000) return `${f(n / 1_000)} nghìn`;
  return String(n);
}

export function engagements(p: Pick<Post, "likes" | "comments" | "shares">): number {
  return p.likes + p.comments + p.shares;
}

/** Bước kế tiếp của booking. Trong hạn mức thì từ Đề xuất sang thẳng Đã chốt. */
export function nextStatus(b: Pick<Booking, "status" | "fee">): BookingStatus | null {
  if (b.status === "cancelled" || b.status === "paid") return null;
  if (b.status === "proposed") return b.fee > BUDGET_LIMIT ? "budget_pending" : "confirmed";
  return BOOKING_FLOW[BOOKING_FLOW.indexOf(b.status) + 1] ?? null;
}

/** Chữ trên nút chuyển bước (động từ cụ thể, DESIGN.md 5.13). */
export const NEXT_ACTION: Partial<Record<BookingStatus, string>> = {
  budget_pending: "Gửi duyệt ngân sách",
  confirmed: "Chốt booking",
  sample_sent: "Ghi đã gửi hàng mẫu",
  script_approved: "Duyệt kịch bản",
  posted: "Ghi bài đã đăng",
  accepted: "Nghiệm thu",
  paid: "Ghi đã thanh toán",
};

/**
 * Điều kiện để sang bước `to`; trả câu giải thích khi chưa đủ, null khi được.
 * Bước "Đã chốt" sau "Chờ duyệt ngân sách" là việc duyệt, kiểm quyền riêng ở lớp thao tác.
 */
export function stepBlocker(data: KocData, b: Booking, to: BookingStatus): string | null {
  if (to === "sample_sent" && b.products.length && !data.samples.some((s) => s.bookingId === b.id))
    return "Chưa ghi hàng mẫu đã gửi cho booking này.";
  if (to === "posted" && !b.posts.length) return "Cần dán link bài đã đăng trước.";
  if (to === "accepted" && !b.posts.some((p) => p.views > 0))
    return "Cần ghi lượt xem, tương tác của bài trước khi nghiệm thu.";
  if (to === "paid") {
    const paid = data.payouts
      .filter((p) => p.bookingId === b.id && p.kind === "fee")
      .reduce((s, p) => s + p.amount, 0);
    if (paid < b.fee)
      return `Mới ghi trả ${paid.toLocaleString("vi-VN")}đ trên ${b.fee.toLocaleString("vi-VN")}đ.`;
  }
  return null;
}

/** Chi phí cố định của booking được tính khi đã chốt trở đi (không tính đề xuất, chờ duyệt, đã hủy). */
export function bookingCost(b: Pick<Booking, "status" | "fee">): number {
  return ["proposed", "budget_pending", "cancelled"].includes(b.status) ? 0 : b.fee;
}

const WON: AttributedLead["stage"][] = ["won"];
const DEPOSIT: AttributedLead["stage"][] = ["deposit", "won"];

export interface CreatorStats {
  bookings: number;
  posts: number;
  views: number;
  engagements: number;
  leads: number;
  /** Lead đã cọc hoặc đã hoàn tất. */
  deposits: number;
  orders: number;
  /** Doanh thu đơn hoàn tất có mã của người này. */
  revenue: number;
  fees: number;
  commission: number;
  /** Tổng chi phí = phí booking + hoa hồng phải trả. */
  cost: number;
  paid: number;
  /** Còn phải trả: phí của booking đã nghiệm thu trở đi cộng hoa hồng, trừ đã trả. */
  owed: number;
  /** Chi phí mỗi lead, chi phí mỗi đơn; null khi chưa có lead, đơn. */
  cpl: number | null;
  cpo: number | null;
  /** Doanh thu trên chi phí; null khi chưa có chi phí. */
  roas: number | null;
}

/** Tỷ lệ hoa hồng áp cho một lead: theo booking mang lead về, không có thì theo hợp đồng. */
function rateFor(data: KocData, l: AttributedLead): number {
  const b = l.bookingId ? data.bookings.find((x) => x.id === l.bookingId) : null;
  if (b) return b.commissionRate;
  return data.creators.find((c) => c.id === l.creatorId)?.contract?.commissionRate ?? 0;
}

/** Chỉ số của một người, hoặc của cả danh sách khi `creatorId` là null. `since` lọc theo ngày (ISO). */
export function creatorStats(data: KocData, creatorId: string | null, since?: string): CreatorStats {
  const mine = <T extends { creatorId: string }>(xs: T[]) =>
    creatorId ? xs.filter((x) => x.creatorId === creatorId) : xs;
  const bookings = mine(data.bookings).filter((b) => !since || b.postAt >= since);
  const posts = bookings.flatMap((b) => b.posts);
  const leads = mine(data.leads).filter((l) => !since || l.createdAt >= since);
  const won = leads.filter((l) => WON.includes(l.stage));
  const revenue = won.reduce((s, l) => s + l.orderValue, 0);
  const commission = Math.round(won.reduce((s, l) => s + (l.orderValue * rateFor(data, l)) / 100, 0));
  const fees = bookings.reduce((s, b) => s + bookingCost(b), 0);
  const cost = fees + commission;
  const paid = mine(data.payouts)
    .filter((p) => !since || p.paidAt >= since)
    .reduce((s, p) => s + p.amount, 0);
  const due =
    bookings.filter((b) => b.status === "accepted" || b.status === "paid").reduce((s, b) => s + b.fee, 0) +
    commission;
  return {
    bookings: bookings.filter((b) => b.status !== "cancelled").length,
    posts: posts.length,
    views: posts.reduce((s, p) => s + p.views, 0),
    engagements: posts.reduce((s, p) => s + engagements(p), 0),
    leads: leads.length,
    deposits: leads.filter((l) => DEPOSIT.includes(l.stage)).length,
    orders: won.length,
    revenue,
    fees,
    commission,
    cost,
    paid,
    owed: Math.max(0, due - paid),
    cpl: leads.length && cost ? Math.round(cost / leads.length) : null,
    cpo: won.length && cost ? Math.round(cost / won.length) : null,
    roas: cost ? revenue / cost : null,
  };
}

/** "4,2 lần" */
export function formatRoas(v: number | null): string {
  return v === null
    ? "Chưa có"
    : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(v)} lần`;
}

/** Mã giới thiệu gợi ý từ tên: bỏ dấu, chữ in, tối đa 8 ký tự, kèm số cho khỏi trùng. */
export function suggestCode(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8) || "KOC";
  for (let i = 1; i < 1000; i++) {
    const code = i === 1 ? base : `${base}${i}`;
    if (!taken.has(code)) return code;
  }
  return `${base}${taken.size + 1}`;
}
