import { describe, expect, it } from "vitest";

import { parseProductCsv, productCsv, PRODUCT_TEMPLATE } from "@/lib/sales/product-csv";

describe("parseProductCsv", () => {
  it("đọc file mẫu", () => {
    const { rows, errors } = parseProductCsv(PRODUCT_TEMPLATE);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        sku: "DC108",
        name: "Ghế massage Daikiosan DC108",
        category: "Ghế massage",
        brand: "Daikiosan",
        price: 16050000,
        warrantyMonths: null,
        bulky: true,
        requiresInstallation: true,
        trackSerial: true,
      },
    ]);
  });

  it("nhận giá kiểu Việt và sku thường", () => {
    const { rows } = parseProductCsv(
      `sku,ten,gia_ban,bao_hanh_thang\ndc302,Ghế DC302,"49.000.000",24\nloi-1,Lõi lọc,"350,000đ",`,
    );
    expect(rows.map((r) => [r.sku, r.price, r.warrantyMonths])).toEqual([
      ["DC302", 49000000, 24],
      ["LOI-1", 350000, null],
    ]);
  });

  it("báo dòng lỗi và SKU lặp", () => {
    const { rows, errors } = parseProductCsv(
      `sku,ten,gia_ban,co_serial\nA1,Ghế A,abc,có\nA2,Ghế B,100,có lẽ\nA3,Ghế C,100,không\nA3,Ghế D,200,không\n,Không mã,1,`,
    );
    expect(rows.map((r) => r.sku)).toEqual(["A3"]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 5, 6]);
    expect(errors[2].message).toContain("lặp");
  });

  it("thiếu cột bắt buộc", () => {
    expect(parseProductCsv("ma,gia\nA,1").errors[0].message).toContain("Thiếu cột");
  });

  it("xuất rồi đọc lại ra cùng dữ liệu", () => {
    const src = parseProductCsv(PRODUCT_TEMPLATE).rows.map(({ line, ...r }) => (void line, r));
    const back = parseProductCsv(productCsv(src)).rows.map(({ line, ...r }) => (void line, r));
    expect(back).toEqual(src);
  });
});
