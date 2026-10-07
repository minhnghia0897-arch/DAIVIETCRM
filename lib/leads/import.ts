import { parseLeadPhone } from "./intake.ts";

// Nhập dữ liệu thủ công cũ từ CSV (CLAUDE.md mục 6, nguồn `import`): xem trước, báo dòng lỗi, dòng trùng.

export const IMPORT_COLUMNS = [
  "ho_ten",
  "so_dien_thoai",
  "quoc_gia",
  "tinh_nguoi_nhan",
  "san_pham",
  "ngay_lien_he_gan_nhat",
  "ghi_chu",
  "nguoi_phu_trach_cu",
] as const;

export const IMPORT_TEMPLATE = `${IMPORT_COLUMNS.join(",")}
Nguyễn Văn A,0912 345 678,VN,Nghệ An,Ghế DV-S7,2026-08-12,Hỏi giá Tết,Thảo
Trần Thị B,010-1234-5678,KR,Long An,Ghế DV-X9,2026-07-30,"Tặng bố, cần lắp",`;

export type ImportStatus = "ok" | "error" | "duplicate_file" | "duplicate_existing";

export interface ImportRow {
  line: number;
  name: string;
  phoneRaw: string;
  e164: string | null;
  country: string;
  province: string;
  product: string;
  lastContact: string;
  note: string;
  previousOwner: string;
  status: ImportStatus;
  errors: string[];
}

/** Tách CSV đơn giản: dấu phẩy, ngoặc kép, ngoặc kép kép bên trong. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function validateImport(
  text: string,
  existingPhones: ReadonlySet<string>,
  /** Thị trường đang bật; quốc gia trống hoặc lạ thì suy từ đầu số (như nhập tay). */
  markets: string[] = ["VN", "KR"],
): { rows: ImportRow[]; headerError?: string } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], headerError: "Tệp trống" };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = ["ho_ten", "so_dien_thoai"].filter((c) => !header.includes(c));
  if (missing.length) return { rows: [], headerError: `Thiếu cột bắt buộc: ${missing.join(", ")}` };
  const col = (r: string[], k: (typeof IMPORT_COLUMNS)[number]) => (r[header.indexOf(k)] ?? "").trim();

  const seen = new Map<string, number>();
  const rows = table.slice(1).map((r, i): ImportRow => {
    const line = i + 2;
    const phoneRaw = col(r, "so_dien_thoai");
    const errors: string[] = [];
    const name = col(r, "ho_ten");
    if (!name) errors.push("Thiếu họ tên");
    const resolved = phoneRaw ? parseLeadPhone(phoneRaw, col(r, "quoc_gia").toUpperCase(), markets) : null;
    const parsed = resolved?.phone ?? null;
    const country = resolved?.country ?? "unknown";
    if (!phoneRaw) errors.push("Thiếu số điện thoại");
    else if (!parsed?.valid) errors.push("Số điện thoại không hợp lệ");
    const lastContact = col(r, "ngay_lien_he_gan_nhat");
    if (lastContact && !/^\d{4}-\d{2}-\d{2}$/.test(lastContact))
      errors.push("Ngày liên hệ phải dạng YYYY-MM-DD");
    const e164 = parsed?.valid ? parsed.e164 : null;

    let status: ImportStatus = errors.length ? "error" : "ok";
    if (status === "ok" && e164) {
      if (seen.has(e164)) {
        status = "duplicate_file";
        errors.push(`Trùng số với dòng ${seen.get(e164)}`);
      } else if (existingPhones.has(e164)) {
        status = "duplicate_existing";
        errors.push("Số đã có trong CRM");
      }
      if (!seen.has(e164)) seen.set(e164, line);
    }
    return {
      line,
      name,
      phoneRaw,
      e164,
      country,
      province: col(r, "tinh_nguoi_nhan"),
      product: col(r, "san_pham"),
      lastContact,
      note: col(r, "ghi_chu"),
      previousOwner: col(r, "nguoi_phu_trach_cu"),
      status,
      errors,
    };
  });
  return { rows };
}
