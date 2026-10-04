import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type PhoneResult =
  | { valid: true; e164: string; country: CountryCode | undefined; raw: string }
  | { valid: false; e164: null; country: null; raw: string };

// Mã quốc gia hay gặp khi khách gõ số không có dấu "+" (ví dụ "84912…", "8210…").
const BARE_PREFIXES: { prefix: string; country: CountryCode }[] = [
  { prefix: "84", country: "VN" },
  { prefix: "82", country: "KR" },
];

function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

function tryParse(text: string, defaultCountry?: CountryCode) {
  const parsed = parsePhoneNumberFromString(text, defaultCountry);
  return parsed && parsed.isValid() ? parsed : undefined;
}

/**
 * Chuẩn hóa số điện thoại về E.164 (CLAUDE.md mục 6).
 * `defaultCountry` lấy theo thị trường của khách; số không hợp lệ vẫn trả về `raw` để gắn cờ `phone_invalid`.
 */
export function normalizePhone(raw: string, defaultCountry: CountryCode = "VN"): PhoneResult {
  const trimmed = raw.trim();
  const digits = digitsOnly(trimmed);
  if (digits.length < 6) return { valid: false, e164: null, country: null, raw };

  const candidates: string[] = [];
  if (trimmed.startsWith("+") || trimmed.startsWith("00")) {
    candidates.push("+" + digits.replace(/^00/, ""));
  } else {
    candidates.push(trimmed);
    for (const { prefix } of BARE_PREFIXES) {
      if (digits.startsWith(prefix)) candidates.push("+" + digits);
    }
    // Số Hàn bị bỏ số 0 đầu: "10-1234-5678".
    if (defaultCountry === "KR" && digits.startsWith("1")) candidates.push("0" + digits);
  }

  for (const text of candidates) {
    const parsed = tryParse(text, text.startsWith("+") ? undefined : defaultCountry);
    if (parsed) return { valid: true, e164: parsed.number, country: parsed.country, raw };
  }
  return { valid: false, e164: null, country: null, raw };
}

/** Suy thị trường từ đầu số; trả `null` khi không xác định được. */
export function countryFromE164(e164: string): CountryCode | null {
  return parsePhoneNumberFromString(e164)?.country ?? null;
}

const DOTS = "•";

/**
 * Che số theo CLAUDE.md mục 5: `+82 10••••4471`, `090•••215`.
 * Số đầy đủ không bao giờ được gửi xuống trình duyệt khi người dùng không có quyền xem.
 */
export function maskPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return DOTS.repeat(6);
  const national = parsed.nationalNumber as string;
  if (parsed.country === "VN") {
    const local = "0" + national;
    return `${local.slice(0, 3)}${DOTS.repeat(3)}${local.slice(-3)}`;
  }
  return `+${parsed.countryCallingCode} ${national.slice(0, 2)}${DOTS.repeat(4)}${national.slice(-4)}`;
}
