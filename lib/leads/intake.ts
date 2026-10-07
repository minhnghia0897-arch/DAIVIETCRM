import type { CountryCode } from "libphonenumber-js";

import { countryFromE164, maskPhone, maskPhonesInText, normalizePhone } from "../phone/index.ts";

// Chuẩn bị dữ liệu cho hàm database ingest_lead (migration 20261007000700_lead_intake.sql). Số điện thoại chuẩn hóa
// và che ở đây vì libphonenumber chỉ có ở server ứng dụng; chống trùng, phân lead làm trong database.

/** Kênh vào lead (leads.source) theo mục nguồn trong danh mục (lead_sources.key). Mục tự thêm thì là nhập tay. */
const SOURCE_BY_KEY: Record<string, string> = {
  fb_ads_kr: "meta_lead_ads",
  fb_ads_vn: "meta_lead_ads",
  zalo_oa: "zalo_oa",
  tiktok_live: "tiktok_live",
  walk_in: "walk_in",
  hotline: "hotline",
  referral: "referral",
  import: "import",
};

export const sourceFromKey = (key: string) => SOURCE_BY_KEY[key] ?? "manual";

export interface IntakeInput {
  fullName: string;
  phone: string;
  /** Mã thị trường trong markets, hoặc "unknown" để suy từ đầu số. */
  country: string;
  sourceKey: string;
  note?: string;
  productInterest?: string;
  recipientProvince?: string;
  marketingConsent?: boolean;
}

export interface IngestPayload {
  full_name: string;
  country: string;
  source: string;
  source_key: string;
  source_detail: Record<string, string>;
  note?: string;
  recipient_province?: string;
  marketing_consent: boolean;
  phone: { raw: string; e164: string | null; masked: string; valid: boolean };
}

/**
 * Dựng tham số cho ingest_lead. `activeMarkets` là các mã thị trường đang bật: thị trường "Chưa rõ" thì suy từ đầu
 * số nếu đầu số thuộc một thị trường đang bật (nhân viên sửa được sau khi khách cho biết khác, CLAUDE.md mục 6).
 */
export function buildIngestPayload(input: IntakeInput, activeMarkets: string[]): IngestPayload {
  // Thử theo thị trường nhân viên chọn trước, rồi các thị trường khác: khách sống ở Hàn vẫn hay dùng số VN, và
  // số Hàn gõ kiểu trong nước ("010-…") không hợp lệ khi phân tích như số VN.
  // "010-xxxx-xxxx" (11 số) là di động Hàn; thư viện số vẫn coi là số VN cũ nên phải thử Hàn trước.
  const krMobile = /^010\d{8}$/.test(input.phone.replace(/\D/g, "")) && activeMarkets.includes("KR");
  const hints = [
    ...new Set([
      ...(activeMarkets.includes(input.country) ? [input.country] : []),
      ...(krMobile ? ["KR"] : []),
      "VN",
      ...activeMarkets,
    ]),
  ] as CountryCode[];
  const p =
    hints.map((h) => normalizePhone(input.phone, h)).find((r) => r.valid) ??
    normalizePhone(input.phone, hints[0]);
  let country = activeMarkets.includes(input.country) ? input.country : "unknown";
  if (country === "unknown" && p.valid) {
    const inferred = countryFromE164(p.e164);
    if (inferred && activeMarkets.includes(inferred)) country = inferred;
  }
  const detail: Record<string, string> = {};
  if (input.productInterest?.trim()) detail.product_interest = input.productInterest.trim().slice(0, 200);
  return {
    full_name: input.fullName.trim(),
    country,
    source: sourceFromKey(input.sourceKey),
    source_key: input.sourceKey,
    source_detail: detail,
    // Không lưu số điện thoại trong ghi chú (CLAUDE.md mục 4, events).
    note: input.note?.trim() ? maskPhonesInText(input.note.trim()) : undefined,
    recipient_province: input.recipientProvince?.trim() || undefined,
    marketing_consent: Boolean(input.marketingConsent),
    phone: p.valid
      ? { raw: input.phone.trim(), e164: p.e164, masked: maskPhone(p.e164), valid: true }
      : { raw: input.phone.trim(), e164: null, masked: maskInvalid(input.phone), valid: false },
  };
}

/** Số sai cũng che như số đúng: chỉ để lộ 3 số cuối. */
function maskInvalid(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 3 ? `•••${digits.slice(-3)}` : "•••";
}
