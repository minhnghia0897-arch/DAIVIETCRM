// Đọc tin của khách trong hội thoại, tìm thông tin đáng lưu vào hồ sơ: số điện thoại, địa chỉ giao, người nhận,
// sản phẩm, dịp mua. Chỉ là gợi ý: nhân viên bấm Lưu mới ghi vào hồ sơ, không tự ghi (CLAUDE.md 10.7, điều 2).
// Hàm thuần, chạy được ở server khi nối Zalo OA thật (tin lưu ở messages, kết quả lưu lại sau khi người xác nhận).

export type FindingKind = "phone" | "address" | "recipient" | "product" | "occasion";

export interface Finding {
  kind: FindingKind;
  /** Nhãn hiển thị; số điện thoại luôn ở dạng che. */
  label: string;
  /** Tin chứa thông tin này (thời điểm), để nhân viên đối chiếu. */
  at: string;
  value: {
    phone?: string;
    province?: string;
    district?: string;
    ward?: string;
    street?: string;
    relation?: string;
    productKey?: string;
    occasion?: string;
  };
}

export interface ProductHint {
  key: string;
  label: string;
  /** Các cách khách hay gọi sản phẩm, viết thường, không dấu. */
  words: string[];
}

/** Bỏ dấu tiếng Việt, viết thường: "Diễn Châu" → "dien chau". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

const PROVINCE_ALIASES: Record<string, string> = {
  "sai gon": "TP.HCM",
  "ho chi minh": "TP.HCM",
  hcm: "TP.HCM",
  "tp hcm": "TP.HCM",
  "ha noi": "Hà Nội",
};

const RELATIONS: [string, string][] = [
  ["bo me", "Bố mẹ"],
  ["ong ba", "Ông bà"],
  ["ba me", "Bố mẹ"],
  ["bo", "Bố"],
  ["ba", "Bố"],
  ["me", "Mẹ"],
  ["ong", "Ông"],
  ["vo", "Vợ"],
  ["chong", "Chồng"],
  ["con", "Con"],
];

const OCCASIONS: [RegExp, string][] = [
  [/\btet\b/, "Tết"],
  [/\b20\/10\b/, "20/10"],
  [/\b8\/3\b/, "8/3"],
  [/sinh nhat/, "Sinh nhật"],
  [/mung tho/, "Mừng thọ"],
  [/vu lan/, "Vu Lan"],
  [/tan gia/, "Tân gia"],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Số nhà, đường: có từ chỉ địa chỉ, hoặc mở đầu bằng số nhà ("12 Lê Lợi", "45/3 Trần Hưng Đạo").
const ADDRESS_WORDS = /\b(so|duong|xom|thon|ap|ngo|hem|kiet|khu|to|lo|kp|khom)\b|^\d+[a-z]?(\/\d+)?\s/;
const DISTRICT_WORDS = /^(quan|huyen|thi xa|tp|thanh pho|q\.?)\s?\S/;
/** Tên huyện viết hoa từng chữ ("Diễn Châu", "Q1"), không có số lẫn trong chữ: tránh lấy nhầm câu hỏi như "Ghế X9 giá nhiu". */
const looksLikePlace = (text: string) =>
  text.split(/\s+/).length <= 4 && text.split(/\s+/).every((w) => /^\p{Lu}[\p{L}]*$/u.test(w));
const WARD_WORDS = /^(phuong|xa|thi tran|p\.?|x\.?)\s/;

/** Số điện thoại trong một câu: đủ 9–15 chữ số, hoặc số đã che (có dấu •). */
function phonesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?<![\p{L}\d])\+?\d[\d .•-]{6,}[\d•]/gu)) {
    const raw = m[0].trim();
    const digits = raw.replace(/\D/g, "");
    const masked = raw.includes("•");
    if ((masked && digits.length >= 5) || (!masked && digits.length >= 9 && digits.length <= 15))
      out.push(raw);
  }
  return out;
}

/** Che số đầy đủ trước khi hiện: chỉ để lộ 3 số đầu và 3 số cuối. */
export function maskForDisplay(raw: string): string {
  if (raw.includes("•")) return raw;
  const d = raw.replace(/\D/g, "");
  return `${raw.trim().startsWith("+") ? "+" : ""}${d.slice(0, 3)}•••${d.slice(-3)}`;
}

function addressIn(text: string, provinces: string[]) {
  const parts = text
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const f = fold(parts[i]).replace(/[.!?]+/g, " ");
    // Tên tỉnh đứng thành cụm từ riêng trong đoạn ("…Nghệ An nha em", "ship binh dinh dc ko").
    const has = (name: string) => new RegExp(`(^|\\s)${escapeRe(name)}(\\s|$)`).test(f);
    const province =
      provinces.find((p) => has(fold(p))) ?? Object.entries(PROVINCE_ALIASES).find(([k]) => has(k))?.[1];
    if (!province) continue;
    const before = parts.slice(0, i).map((p) => p.replace(/^.*\b(?:ở|tại|tận|về|giao)\s+/i, "").trim());
    let ward: string | undefined;
    let district: string | undefined;
    const streetParts: string[] = [];
    for (const b of before.reverse()) {
      const fb = fold(b);
      if (
        !district &&
        !ADDRESS_WORDS.test(fb) &&
        !WARD_WORDS.test(fb) &&
        (DISTRICT_WORDS.test(fb) || looksLikePlace(b))
      )
        district = b;
      else if (!ward && WARD_WORDS.test(fb)) ward = b;
      else if (ADDRESS_WORDS.test(fb) || streetParts.length) streetParts.unshift(b);
    }
    return { province, district, ward, street: streetParts.join(", ") || undefined };
  }
  return null;
}

function relationIn(text: string): string | undefined {
  const f = ` ${fold(text)} `;
  for (const [w, label] of RELATIONS) {
    if (new RegExp(`\\b(cho|tang|bieu|bieu cho)\\s+${w}\\b`).test(f)) return label;
  }
  return undefined;
}

/**
 * Tìm thông tin trong các tin của khách. `messages`: [nội dung, thời điểm] theo thứ tự; tin mới hơn ghi đè tin cũ
 * cho cùng một loại (khách đổi địa chỉ thì lấy địa chỉ sau cùng).
 */
export function extractFindings(
  messages: [string, string][],
  provinces: string[],
  products: ProductHint[],
): Finding[] {
  const found = new Map<string, Finding>();
  for (const [text, at] of messages) {
    for (const raw of phonesIn(text)) {
      found.set(`phone:${raw.replace(/\D/g, "")}`, {
        kind: "phone",
        label: maskForDisplay(raw),
        at,
        value: { phone: raw },
      });
    }
    const addr = addressIn(text, provinces);
    if (addr) {
      found.set("address", {
        kind: "address",
        label: [addr.street, addr.ward, addr.district, addr.province].filter(Boolean).join(", "),
        at,
        value: addr,
      });
    }
    const relation = relationIn(text);
    if (relation)
      found.set("recipient", {
        kind: "recipient",
        label: `Tặng ${relation.toLowerCase()}`,
        at,
        value: { relation },
      });
    const f = fold(text);
    for (const p of products) {
      if (p.words.some((w) => new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(f)))
        found.set(`product:${p.key}`, { kind: "product", label: p.label, at, value: { productKey: p.key } });
    }
    for (const [re, label] of OCCASIONS) {
      if (re.test(f)) found.set("occasion", { kind: "occasion", label, at, value: { occasion: label } });
    }
  }
  return [...found.values()];
}
