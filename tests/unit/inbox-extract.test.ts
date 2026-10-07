import { describe, expect, it } from "vitest";

import { extractFindings, fold, maskForDisplay, type ProductHint } from "@/lib/inbox/extract";

const PROVINCES = ["TP.HCM", "Nghệ An", "Bình Định", "Hà Nội", "Đồng Nai"];
const PRODUCTS: ProductHint[] = [
  { key: "x9", label: "Ghế DV-X9", words: ["x9", "dv-x9"] },
  { key: "ion", label: "Máy lọc ion", words: ["loc ion"] },
];
const run = (...texts: string[]) =>
  extractFindings(
    texts.map((t, i) => [t, `10:0${i}`]),
    PROVINCES,
    PRODUCTS,
  );

describe("extractFindings", () => {
  it("tách địa chỉ giao: số nhà, xã, huyện, tỉnh", () => {
    const f = run("Giao về xóm 5, xã Diễn Thành, Diễn Châu, Nghệ An nha em.");
    expect(f.find((x) => x.kind === "address")?.value).toEqual({
      province: "Nghệ An",
      district: "Diễn Châu",
      ward: "xã Diễn Thành",
      street: "xóm 5",
    });
  });

  it("nhận tỉnh viết không dấu, viết tắt", () => {
    expect(run("ship binh dinh dc ko").find((x) => x.kind === "address")?.value.province).toBe("Bình Định");
    expect(run("Giao 12 Lê Lợi, Q1, Sài Gòn").find((x) => x.kind === "address")?.value.province).toBe(
      "TP.HCM",
    );
  });

  it("số điện thoại: lấy cả số đã che, hiện luôn ở dạng che", () => {
    const f = run("Số chị 0912 345 678 nha", "Zalo bố: 0388•••241");
    const phones = f.filter((x) => x.kind === "phone");
    expect(phones.map((p) => p.label)).toEqual(["091•••678", "0388•••241"]);
    expect(phones[0].value.phone).toBe("0912 345 678");
  });

  it("không nhầm mã đơn, ngày, giá thành số điện thoại", () => {
    const f = run("Đơn Q4-2610-0012 giao 13/10, giá 79.900.000 đ");
    expect(f.filter((x) => x.kind === "phone")).toHaveLength(0);
  });

  it("người nhận, sản phẩm, dịp", () => {
    const f = run("Chị định mua X9 tặng bố mẹ dịp Tết");
    expect(f.find((x) => x.kind === "recipient")?.value.relation).toBe("Bố mẹ");
    expect(f.find((x) => x.kind === "product")?.value.productKey).toBe("x9");
    expect(f.find((x) => x.kind === "occasion")?.value.occasion).toBe("Tết");
  });

  it("khách đổi địa chỉ thì lấy địa chỉ sau cùng", () => {
    const f = run("Giao Đồng Nai nha", "À thôi giao về Hà Nội em");
    expect(f.filter((x) => x.kind === "address")).toHaveLength(1);
    expect(f.find((x) => x.kind === "address")?.value.province).toBe("Hà Nội");
  });
});

describe("tiện ích", () => {
  it("fold bỏ dấu", () => expect(fold("Diễn Châu, Đồng Nai")).toBe("dien chau, dong nai"));
  it("che số", () => expect(maskForDisplay("+82 10 5521 2290")).toBe("+821•••290"));
});
