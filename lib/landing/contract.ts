import { z } from "zod";

// Landing page chạy trên CRM (Owner chốt 20/10/2026, docs/integrations/landing_page.md). File này dùng chung cho máy
// chủ (trang /lp/<slug>, nhận form) và màn Marketing → Landing page: hợp đồng dữ liệu CRM chèn vào trang, cài đặt của
// trang, dữ liệu form khách gửi.

export const LANDING_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const isLandingSlug = (s: string) => s.length >= 2 && s.length <= 60 && LANDING_SLUG.test(s);

/** "Khai trương Quận 4!" → "khai-truong-quan-4". */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

const text = (max: number) => z.string().trim().max(max).optional().default("");
const url = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === "" || /^https?:\/\//.test(v), "url")
  .optional()
  .default("");
/** Messenger: link https (m.me/…), "m.me/tên-page", tên Page hoặc Page ID; trang tự dựng link m.me. */
const messenger = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (/^(www\.)?m\.me\//i.test(v) ? `https://${v.replace(/^www\./i, "")}` : v))
  .refine((v) => v === "" || /^https?:\/\//.test(v) || /^[\w.-]{1,100}$/.test(v), "messenger")
  .optional()
  .default("");

/** Cài đặt của một trang (landing_pages.settings): liên hệ, đếm ngược, ảnh banner. Ô trống thì trang ẩn phần đó. */
export const landingSettingsSchema = z.object({
  hotline: text(30),
  zalo: text(200),
  /** Trống thì trang dùng Page Facebook đã kết nối Messenger với CRM. */
  messenger,
  address: text(300),
  openHours: text(120),
  kakao: text(60),
  mapUrl: url,
  /** Logo trên thanh đầu trang; trống thì hiện chữ tên thương hiệu của mẫu. */
  logoUrl: url,
  /** Ảnh lớn đầu trang trên máy tính; trên điện thoại dùng ảnh riêng nếu có, không thì dùng ảnh này. */
  bannerUrl: url,
  bannerMobileUrl: url,
  /** Hạn ưu đãi theo giờ VN, dạng "2026-10-31T23:59". */
  countdownEnd: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), "date")
    .optional()
    .default(""),
});

export type LandingSettings = z.infer<typeof landingSettingsSchema>;

export function readLandingSettings(raw: unknown): LandingSettings {
  const r = landingSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : landingSettingsSchema.parse({});
}

export interface LandingProduct {
  sku: string;
  name: string;
  shortDesc: string | null;
  imageUrl: string | null;
  badge: string | null;
  giftText: string | null;
  /** Giá niêm yết trong bảng giá bán lẻ. */
  listPrice: number;
  /** Giá sau khuyến mãi đang chạy (hàm định giá CRM, kênh online); bằng giá niêm yết khi không có khuyến mãi. */
  price: number;
  /** Quà khuyến mãi tặng kèm sản phẩm này (chính sách đang chạy). */
  promoGifts: string[];
  /** Tên các khuyến mãi đang áp. */
  promotions: string[];
  /** Ảnh ở khung chi tiết: ảnh chính rồi tới các ảnh chi tiết (tối đa 5). */
  images: string[];
  /** Thông tin chi tiết (viết riêng cho landing, trống thì lấy mô tả sản phẩm); xuống dòng giữ nguyên. */
  detail: string | null;
  warrantyMonths: number | null;
}

export interface LandingGift {
  sku: string;
  name: string;
  /** Giá trị tham khảo; 0 là chưa nhập. */
  value: number;
  imageUrl: string | null;
}

/** window.CRM_LANDING: dữ liệu CRM chèn vào mỗi trang. Không có số điện thoại hay dữ liệu khách. */
export interface LandingData {
  page: { slug: string; title: string };
  products: LandingProduct[];
  gifts: LandingGift[];
  contact: {
    hotline: string;
    zalo: string;
    /** Link https hoặc tên Page, Page ID (trang dựng link m.me); rỗng thì ẩn nút Messenger. */
    messenger: string;
    address: string;
    openHours: string;
    kakao: string;
    mapUrl: string;
  };
  /** Logo, ảnh lớn đầu trang (máy tính, điện thoại); rỗng khi chưa tải. */
  logoUrl: string;
  bannerUrl: string;
  bannerMobileUrl: string;
  /** Hạn ưu đãi dạng ISO có múi giờ VN, rỗng khi không đặt. */
  countdownEnd: string;
  leadUrl: string;
}

/** Form khách gửi. Thêm ô nào khác thì ghi vào ghi chú lead (đã che số điện thoại). */
export const landingLeadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => {
      const n = v.replace(/\D/g, "").length;
      return n >= 8 && n <= 15;
    }, "phone"),
  model: z.string().trim().max(120).optional().default(""),
  /** VN, KR hoặc mã thị trường khác; trống là chưa rõ. */
  where: z.string().trim().max(10).optional().default(""),
  whereLabel: z.string().trim().max(120).optional().default(""),
  note: z.string().trim().max(1000).optional().default(""),
  consent: z.union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("")]).optional(),
  /** Bẫy máy: người thật không thấy ô này nên để trống. */
  website: z.string().max(200).optional().default(""),
  utm: z.record(z.string(), z.string().max(200)).optional().default({}),
  referrer: z.string().max(500).optional().default(""),
});

export type LandingLead = z.infer<typeof landingLeadSchema>;

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "ttclid",
];

/** Nguồn quảng cáo giữ lại để sau này gửi chuyển đổi về nền tảng (CLAUDE.md 10.5). */
export function pickUtm(utm: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) if (utm[k]?.trim()) out[k] = utm[k].trim().slice(0, 200);
  return out;
}

export const consentGiven = (v: LandingLead["consent"]) => v === true || v === "on" || v === "true";

/** Giờ VN "2026-10-31T23:59" → ISO có múi giờ để trang tính đếm ngược đúng ở mọi máy. */
export const vnLocalToIso = (v: string) => (v ? `${v}:00+07:00` : "");
