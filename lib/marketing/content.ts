import { TZDate } from "@date-fns/tz";
import { z } from "zod";

// Lịch nội dung (migration 20261010000200_content_calendar.sql): nhãn cột, kênh, dạng nội dung, kiểm dữ liệu, luật
// cột (bản sao phía giao diện của check_content_stage để báo trước khi gửi), nhóm theo tuần. Hàm thuần.

export const CONTENT_STAGES = [
  { key: "idea", label: "Ý tưởng" },
  { key: "script", label: "Viết kịch bản" },
  { key: "production", label: "Đang sản xuất" },
  { key: "review", label: "Chờ duyệt" },
  { key: "scheduled", label: "Đã lên lịch" },
  { key: "published", label: "Đã đăng" },
] as const;
export type ContentStage = (typeof CONTENT_STAGES)[number]["key"];

export const CONTENT_CHANNELS = {
  facebook: "Facebook",
  tiktok: "TikTok",
  zalo_oa: "Zalo OA",
  youtube: "YouTube",
  instagram: "Instagram",
  koc: "Kênh KOL, KOC",
} as const;
export type ContentChannel = keyof typeof CONTENT_CHANNELS;

export const CONTENT_FORMATS = {
  short_video: "Video ngắn",
  livestream: "Livestream",
  post: "Bài viết",
  image: "Ảnh",
  koc_video: "Video KOC",
} as const;
export type ContentFormat = keyof typeof CONTENT_FORMATS;

export const REVIEW_CHECKS = {
  no_health_claim: "Không hứa chữa bệnh, không nói công dụng y tế",
  customer_consent: "Ảnh, tên, câu chuyện của khách đã được khách đồng ý",
} as const;

export interface ContentItem {
  id: string;
  title: string;
  channel: ContentChannel;
  format: ContentFormat;
  status: ContentStage;
  ownerId: string | null;
  ownerName: string | null;
  /** ISO, thời điểm đăng dự kiến. */
  publishAt: string | null;
  market: string | null;
  product: string | null;
  campaignId: string | null;
  campaignName: string | null;
  draftUrl: string | null;
  postUrl: string | null;
  note: string | null;
  checks: { no_health_claim: boolean; customer_consent: boolean };
  position: number;
}

const https = z
  .string()
  .trim()
  .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Link phải bắt đầu bằng https://");

export const contentSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Nhập tiêu đề").max(200, "Tiêu đề tối đa 200 ký tự"),
  channel: z.enum(Object.keys(CONTENT_CHANNELS) as [ContentChannel, ...ContentChannel[]], "Chọn kênh"),
  format: z.enum(Object.keys(CONTENT_FORMATS) as [ContentFormat, ...ContentFormat[]], "Chọn dạng nội dung"),
  status: z.enum(CONTENT_STAGES.map((s) => s.key) as [ContentStage, ...ContentStage[]]).optional(),
  ownerId: z.union([z.literal(""), z.uuid()]).default(""),
  /** ISO có múi giờ, hoặc rỗng. */
  publishAt: z.union([z.literal(""), z.iso.datetime({ offset: true })]).default(""),
  market: z.string().default(""),
  product: z.string().trim().max(200).default(""),
  campaignId: z.union([z.literal(""), z.uuid()]).default(""),
  draftUrl: https.default(""),
  postUrl: https.default(""),
  note: z.string().max(2000).default(""),
  checks: z.object({ no_health_claim: z.boolean(), customer_consent: z.boolean() }).default({
    no_health_claim: false,
    customer_consent: false,
  }),
});
export type ContentInput = z.input<typeof contentSchema>;

/** Lý do chưa chuyển được sang cột đích; null là được. Server kiểm lại (check_content_stage). */
export function stageBlocker(
  item: Pick<ContentItem, "publishAt" | "postUrl" | "checks">,
  to: ContentStage,
): string | null {
  if (to === "scheduled" || to === "published") {
    if (!item.publishAt) return "Cần ngày giờ đăng trước khi lên lịch.";
    if (!item.checks.no_health_claim || !item.checks.customer_consent)
      return "Cần tick hai mục kiểm nội dung trước khi lên lịch.";
  }
  if (to === "published" && !item.postUrl) return "Cần link bài đã đăng.";
  return null;
}

/** Quá giờ đăng mà chưa đăng. */
export function isOverdue(item: Pick<ContentItem, "publishAt" | "status">, now: Date): boolean {
  return (
    Boolean(item.publishAt) && item.status !== "published" && Date.parse(item.publishAt!) < now.getTime()
  );
}

const VN = "Asia/Ho_Chi_Minh";

/** Ngày (YYYY-MM-DD) theo giờ VN của một thời điểm. */
export function vnDay(iso: string): string {
  const t = new TZDate(new Date(iso), VN);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** 7 ngày (Thứ Hai → Chủ nhật, giờ VN) của tuần chứa `now`, lệch `offset` tuần. */
export function weekDays(now: Date, offset = 0): string[] {
  const t = new TZDate(now, VN);
  const dow = (t.getDay() + 6) % 7; // 0 = Thứ Hai
  const monday = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate() - dow + offset * 7);
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * 86_400_000).toISOString().slice(0, 10));
}

/** "09:30" theo giờ VN; thêm giờ Hàn khi bài nhắm khách ở Hàn. */
export function publishTimeLabel(iso: string, market: string | null): string {
  const f = (tz: string) =>
    new Intl.DateTimeFormat("vi-VN", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(
      new Date(iso),
    );
  return market === "KR" ? `${f(VN)} (Hàn ${f("Asia/Seoul")})` : f(VN);
}

/** Thứ tự hiển thị trong một cột. */
export function columnItems(items: ContentItem[], stage: ContentStage): ContentItem[] {
  return items.filter((i) => i.status === stage).sort((a, b) => a.position - b.position);
}
