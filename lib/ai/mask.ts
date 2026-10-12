// Che dữ liệu nhạy cảm trước khi gửi sang mô hình AI (CLAUDE.md 10.3, 10.7): số điện thoại, dãy số dài (CCCD, số tài
// khoản), email. Mô hình chỉ thấy chỗ đánh dấu, không thấy giá trị.

export const PHONE_MARK = "[số điện thoại]";
export const EMAIL_MARK = "[email]";

const LONG_NUMBER = /(?<![\p{L}\d-])\+?\d[\d .-]{7,}\d/gu;
const EMAIL = /[\p{L}\d._%+-]+@[\p{L}\d.-]+\.[\p{L}]{2,}/gu;

export interface Redacted {
  text: string;
  /** Có dãy giống số điện thoại (9 tới 15 chữ số) trong đoạn chữ. */
  hasPhone: boolean;
}

export function redactForAi(text: string): Redacted {
  let hasPhone = false;
  const out = text.replace(EMAIL, EMAIL_MARK).replace(LONG_NUMBER, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) return m;
    hasPhone = true;
    return PHONE_MARK;
  });
  return { text: out, hasPhone };
}
