import { parseCsv } from "@/lib/leads/import";

// Nhập, xuất sản phẩm và giá bằng CSV (CLAUDE.md 8.2, 10.4: Đại Việt không có API, gửi file cho admin nhập).
// Hàm thuần: đọc file thành các dòng đã kiểm, báo dòng lỗi; không ghi gì.

export const PRODUCT_COLUMNS = [
  "sku",
  "ten",
  "nhom",
  "thuong_hieu",
  "gia_ban",
  "bao_hanh_thang",
  "hang_cong_kenh",
  "can_lap_dat",
  "co_serial",
] as const;

export const PRODUCT_TEMPLATE = `${PRODUCT_COLUMNS.join(",")}
DC108,Ghế massage Daikiosan DC108,Ghế massage,Daikiosan,16050000,,có,có,có
`;

export interface ProductRow {
  line: number;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  price: number | null;
  warrantyMonths: number | null;
  bulky: boolean;
  requiresInstallation: boolean;
  trackSerial: boolean;
}

const YES = new Set(["có", "co", "x", "1", "yes", "true", "y"]);
const NO = new Set(["không", "khong", "0", "no", "false", "n", ""]);

/** Số tiền viết kiểu Việt: "16.050.000", "16,050,000", "16050000đ". */
function money(raw: string): number | null | "bad" {
  const t = raw.trim();
  if (!t) return null;
  const digits = t.replace(/[.,\sđ₫]/g, "").replace(/d$/i, "");
  return /^\d{1,12}$/.test(digits) ? Number(digits) : "bad";
}

function flag(raw: string | undefined): boolean | "bad" {
  const t = (raw ?? "").trim().toLowerCase();
  if (YES.has(t)) return true;
  if (NO.has(t)) return false;
  return "bad";
}

export function parseProductCsv(text: string): {
  rows: ProductRow[];
  errors: { line: number; message: string }[];
} {
  const table = parseCsv(text);
  const errors: { line: number; message: string }[] = [];
  const rows: ProductRow[] = [];
  if (!table.length) return { rows, errors: [{ line: 1, message: "File trống" }] };
  const head = table[0].map((h) => h.trim().toLowerCase());
  const col = (name: (typeof PRODUCT_COLUMNS)[number]) => head.indexOf(name);
  if (col("sku") < 0 || col("ten") < 0)
    return { rows, errors: [{ line: 1, message: "Thiếu cột sku hoặc ten, tải file mẫu để xem đúng cột" }] };
  const seen = new Set<string>();
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (name: (typeof PRODUCT_COLUMNS)[number]) =>
      col(name) >= 0 ? (r[col(name)] ?? "").trim() : "";
    const sku = get("sku").toUpperCase();
    const name = get("ten");
    const problems: string[] = [];
    if (!sku || sku.length > 60) problems.push("SKU trống hoặc quá 60 ký tự");
    if (!name || name.length > 200) problems.push("tên trống hoặc quá 200 ký tự");
    if (sku && seen.has(sku)) problems.push(`SKU ${sku} lặp trong file`);
    const price = money(get("gia_ban"));
    if (price === "bad") problems.push("giá bán không phải số tiền");
    const wRaw = get("bao_hanh_thang");
    const warranty = wRaw ? Number(wRaw) : null;
    if (warranty !== null && (!Number.isInteger(warranty) || warranty < 0 || warranty > 240))
      problems.push("bảo hành phải là số tháng từ 0 đến 240");
    const bulky = flag(get("hang_cong_kenh"));
    const install = flag(get("can_lap_dat"));
    const serial = flag(get("co_serial"));
    if (bulky === "bad" || install === "bad" || serial === "bad")
      problems.push("các cột có/không chỉ nhận: có, không");
    if (problems.length) {
      errors.push({ line, message: problems.join("; ") });
      return;
    }
    seen.add(sku);
    rows.push({
      line,
      sku,
      name,
      category: get("nhom") || null,
      brand: get("thuong_hieu") || null,
      price: price as number | null,
      warrantyMonths: warranty,
      bulky: bulky as boolean,
      requiresInstallation: install as boolean,
      trackSerial: serial as boolean,
    });
  });
  return { rows, errors };
}

const cell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function productCsv(
  rows: {
    sku: string;
    name: string;
    category: string | null;
    brand: string | null;
    price: number | null;
    warrantyMonths: number | null;
    bulky: boolean;
    requiresInstallation: boolean;
    trackSerial: boolean;
  }[],
): string {
  const yn = (b: boolean) => (b ? "có" : "không");
  return [
    PRODUCT_COLUMNS.join(","),
    ...rows.map((r) =>
      [
        r.sku,
        r.name,
        r.category,
        r.brand,
        r.price,
        r.warrantyMonths,
        yn(r.bulky),
        yn(r.requiresInstallation),
        yn(r.trackSerial),
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\n");
}
