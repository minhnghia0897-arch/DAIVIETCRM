import { z } from "zod";

// Chiến dịch marketing (migration 20261010000100_marketing.sql). Nhãn, kiểm tra dữ liệu vào và chỉ số dùng chung
// cho server action, màn Marketing và bản demo. Hàm thuần.

export const PLATFORMS = {
  facebook: "Facebook",
  tiktok: "TikTok",
  zalo: "Zalo",
  google: "Google",
  koc: "KOL, KOC",
  offline: "Tại showroom, sự kiện",
  other: "Khác",
} as const;
export type Platform = keyof typeof PLATFORMS;

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "err" | "n" }> = {
  pending_approval: { label: "Chờ duyệt ngân sách", tone: "warn" },
  active: { label: "Đang chạy", tone: "ok" },
  paused: { label: "Tạm dừng", tone: "n" },
  ended: { label: "Đã kết thúc", tone: "n" },
  rejected: { label: "Ngân sách bị từ chối", tone: "err" },
};

const money = z.coerce
  .number()
  .int("Số tiền là số nguyên, đơn vị đồng")
  .min(0, "Số tiền không âm")
  .max(100_000_000_000, "Số tiền quá lớn");

const day = z.union([z.literal(""), z.iso.date("Ngày không đúng dạng")]);

export const campaignSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "Nhập tên chiến dịch").max(200, "Tên tối đa 200 ký tự"),
    platform: z.enum(Object.keys(PLATFORMS) as [Platform, ...Platform[]], "Chọn nền tảng"),
    externalId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_.:-]{0,100}$/, "Mã chiến dịch chỉ gồm chữ, số, dấu gạch")
      .default(""),
    market: z.string().default(""),
    startsOn: day.default(""),
    endsOn: day.default(""),
    note: z.string().max(1000).default(""),
    status: z.enum(["active", "paused", "ended"]).optional(),
    /** Chỉ khi tạo mới: ngân sách xin duyệt. */
    budget: money.default(0),
  })
  .refine((c) => !c.startsOn || !c.endsOn || c.endsOn >= c.startsOn, {
    message: "Ngày kết thúc phải sau ngày bắt đầu",
    path: ["endsOn"],
  });

export type CampaignInput = z.input<typeof campaignSchema>;

/** Đổi chuỗi người dùng gõ ("20.000.000", "20tr", "1,5tr") ra số đồng; không hiểu thì trả null. */
export function parseMoney(text: string): number | null {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/\s|đ|vnd/g, "");
  if (!t) return null;
  const m = t.match(/^(\d+(?:[.,]\d+)?)(tr|triệu|trieu|k|nghìn|nghin)$/);
  if (m) {
    const n = Number(m[1].replace(",", "."));
    const unit = m[2].startsWith("t") ? 1_000_000 : 1_000;
    return Number.isFinite(n) ? Math.round(n * unit) : null;
  }
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(t)) return null;
  return Number(t.replace(/[.,]/g, ""));
}

export const vnd = (n: number) => `${new Intl.NumberFormat("vi-VN").format(Math.round(n))} đ`;

/** "12,5 tr" cho ô chỉ số; dưới 1 triệu hiện đầy đủ. */
export function shortVnd(n: number): string {
  if (Math.abs(n) >= 1_000_000)
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(n / 1_000_000)} tr`;
  return vnd(n);
}

export interface FunnelRow {
  leads: number;
  contacted: number;
  converted: number;
  lost: number;
  spend: number;
}

/** Chỉ số theo lô lead: chi phí mỗi lead, mỗi lead chốt (đặt cọc trở lên), tỷ lệ liên hệ, tỷ lệ chốt. */
export function funnelMetrics(r: FunnelRow) {
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  return {
    cpl: r.leads > 0 && r.spend > 0 ? Math.round(r.spend / r.leads) : null,
    costPerWin: r.converted > 0 && r.spend > 0 ? Math.round(r.spend / r.converted) : null,
    contactRate: pct(r.contacted, r.leads),
    winRate: pct(r.converted, r.leads),
  };
}

/** Phần trăm ngân sách đã tiêu; null khi chưa có ngân sách. */
export function budgetUsed(spend: number, budget: number): number | null {
  return budget > 0 ? Math.round((spend / budget) * 100) : null;
}

export interface SpendRow {
  line: number;
  date: string;
  campaign: string;
  amount: number;
}

export interface SpendParse {
  rows: SpendRow[];
  errors: { line: number; message: string }[];
}

/**
 * Đọc file CSV chi phí (xuất từ trình quản lý quảng cáo hoặc tự lập): cột ngày, chiến dịch (mã hoặc tên), số tiền.
 * Nhận dấu phẩy hoặc chấm phẩy; ngày dạng YYYY-MM-DD hoặc DD/MM/YYYY. Dòng đầu là tiêu đề.
 */
export function parseSpendCsv(text: string): SpendParse {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const out: SpendParse = { rows: [], errors: [] };
  if (lines.length < 2) {
    out.errors.push({ line: 1, message: "File chưa có dòng dữ liệu" });
    return out;
  }
  const sep = lines[0].includes(";") ? ";" : ",";
  const split = (l: string) => {
    const cells: string[] = [];
    let cur = "";
    let q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === sep && !q) {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const find = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = find("ngày", "ngay", "date", "day");
  const iCamp = find("chiến dịch", "chien dich", "campaign");
  const iAmount = find("số tiền", "so tien", "chi phí", "chi phi", "amount", "spend", "cost");
  if (iDate < 0 || iCamp < 0 || iAmount < 0) {
    out.errors.push({ line: 1, message: "Thiếu cột: cần Ngày, Chiến dịch, Số tiền" });
    return out;
  }
  lines.slice(1).forEach((l, i) => {
    const line = i + 2;
    const c = split(l);
    const rawDate = c[iDate] ?? "";
    const dm = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const date = dm ? `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}` : rawDate;
    const amount = parseMoney(c[iAmount] ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))
      out.errors.push({ line, message: "Ngày không đúng dạng" });
    else if (!c[iCamp]) out.errors.push({ line, message: "Thiếu chiến dịch" });
    else if (amount === null) out.errors.push({ line, message: "Số tiền không đọc được" });
    else out.rows.push({ line, date, campaign: c[iCamp], amount });
  });
  return out;
}
