import { z } from "zod";

// Kiểm tra dữ liệu và hàm thuần cho Cài đặt: Phân lead, Thị trường, Danh mục (CLAUDE.md mục 6, 7, 11.2).
// Dùng chung cho server action (chặn ở server) và giao diện (báo lỗi sớm).

export const assignmentSchema = z.object({
  slaMinutes: z.number().int().min(1).max(1440),
  maxUncontacted: z.number().int().min(1).max(500),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const callWindowSchema = z
  .object({
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    start: hhmm,
    end: hhmm,
  })
  .refine((w) => w.end > w.start, { message: "Giờ kết thúc phải sau giờ bắt đầu." });

export const MARKET_CHANNELS = ["call", "zalo_oa", "zns", "sms", "email"] as const;
export const CHANNEL_LABEL: Record<(typeof MARKET_CHANNELS)[number], string> = {
  call: "Gọi điện",
  zalo_oa: "Zalo OA",
  zns: "Tin ZNS",
  sms: "SMS",
  email: "Email",
};

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return /\//.test(tz);
  } catch {
    return false;
  }
}

export const marketSchema = z
  .object({
    id: z.uuid().optional(),
    countryCode: z.string().regex(/^[A-Z]{2}$/, "Mã quốc gia gồm 2 chữ in, ví dụ JP."),
    name: z.string().trim().min(2).max(60),
    timezone: z.string().refine(isTimeZone, "Múi giờ chưa đúng, ví dụ Asia/Tokyo."),
    callWindows: z.array(callWindowSchema).max(14),
    allowedChannels: z.array(z.enum(MARKET_CHANNELS)).min(1),
    isActive: z.boolean(),
  })
  .refine((m) => !m.allowedChannels.includes("zns") || m.countryCode === "VN", {
    message: "Tin ZNS chỉ gửi được tới số Việt Nam.",
  });

export const CATALOGS = {
  lead_sources: "Nguồn lead",
  occasions: "Dịp tặng",
  call_outcomes: "Kết quả cuộc gọi",
  lost_reasons: "Lý do thất bại",
  budget_ranges: "Ngân sách",
} as const;
export type CatalogTable = keyof typeof CATALOGS;

export const catalogItemSchema = z.object({
  table: z.enum(Object.keys(CATALOGS) as [CatalogTable, ...CatalogTable[]]),
  id: z.uuid().optional(),
  label: z.string().trim().min(1).max(80),
  isActive: z.boolean(),
});

/** Mã cho mục danh mục mới, từ nhãn: bỏ dấu, chữ thường, gạch dưới; thêm số khi trùng. */
export function catalogKey(label: string, taken: ReadonlySet<string>): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) || "muc";
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}

/** Độ lệch giờ (phút) của một múi giờ so với UTC tại một thời điểm. */
function offsetMinutes(tz: string, at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((local - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** Khung giờ địa phương đổi sang giờ VN: "19:00–22:30" giờ Hàn → "17:00–20:30". Qua nửa đêm thì ghi "hôm sau". */
export function toVnRange(start: string, end: string, tz: string, at: Date): string {
  const diff = offsetMinutes("Asia/Ho_Chi_Minh", at) - offsetMinutes(tz, at);
  const shift = (hm: string) => {
    const m = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) + diff;
    const day = m < 0 ? " hôm trước" : m >= 1440 ? " hôm sau" : "";
    const v = ((m % 1440) + 1440) % 1440;
    return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}${day}`;
  };
  return `${shift(start)}–${shift(end)}`;
}

export const DAY_LABEL: [number, string][] = [
  [1, "T2"],
  [2, "T3"],
  [3, "T4"],
  [4, "T5"],
  [5, "T6"],
  [6, "T7"],
  [7, "CN"],
];
