import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Nhập file CSV dữ liệu cũ trên bản thật (migration 20261007000800_lead_import.sql): xem trước báo dòng lỗi và dòng
// trùng trong tệp, nhập vào hàng Chưa phân, nhập lại cùng tệp thì ghi vào lead cũ thay vì tạo lead mới. Ghi vào
// database nên chỉ chạy một cỡ màn, sau `pnpm db:reset`.

const tail = String(Date.now()).slice(-7);
const a = `Khách nhập A${tail.slice(-3)}`;
const b = `Khách nhập B${tail.slice(-3)}`;
const csv = [
  "ho_ten,so_dien_thoai,quoc_gia,tinh_nguoi_nhan,san_pham,ngay_lien_he_gan_nhat,ghi_chu,nguoi_phu_trach_cu",
  `${a},091${tail},VN,Nghệ An,Ghế DV-X9,2026-08-12,Hỏi giá Tết,`,
  `${b},+82 10 5${tail},KR,Long An,,,Ở Busan,`,
  `Khách trùng,091${tail},VN,Hà Tĩnh,,,,`,
  `Khách số sai,12345,VN,,,,,`,
].join("\n");

async function upload(page: import("@playwright/test").Page) {
  await page.goto("/leads");
  await page.getByRole("button", { name: "Nhập file" }).click();
  const panel = page.getByRole("region", { name: "Nhập file lead" });
  await panel.getByLabel("Chọn tệp CSV").setInputFiles({
    name: "du-lieu-cu.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  return panel;
}

test("nhập file lead cũ: xem trước, nhập, nhập lại không tạo trùng", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
  await login(page, USERS.saleAdmin);

  let panel = await upload(page);
  const preview = panel.getByRole("status").first();
  await expect(preview).toContainText("4 dòng");
  await expect(preview).toContainText("2 hợp lệ");
  await expect(preview).toContainText("1 lỗi");
  await expect(preview).toContainText("1 trùng trong tệp");
  await expect(preview).not.toContainText("đang kiểm tra");
  await panel.getByRole("button", { name: "Nhập 2 dòng" }).click();
  const result = panel.getByRole("status", { name: "Kết quả nhập" });
  await expect(result).toContainText("Đã nhập 2 lead mới");
  await expect(result).toContainText("2 lead đang ở hàng Chưa phân");

  await page.goto(`/leads?view=unassigned&q=${encodeURIComponent(a)}`);
  await expect(page.getByRole("link", { name: a })).toHaveCount(1);

  // Nhập lại cùng tệp: hai số đã có trong CRM, ghi thành hoạt động trên lead cũ.
  panel = await upload(page);
  await expect(panel.getByRole("status").first()).toContainText("2 đã có trong CRM");
  await panel.getByRole("button", { name: "Nhập 2 dòng" }).click();
  await expect(panel.getByRole("status", { name: "Kết quả nhập" })).toContainText(
    "Đã nhập 0 lead mới, ghi 2 dòng vào lead cũ",
  );
});

test("telesale không có nút nhập file", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Một cỡ màn là đủ");
  await login(page, USERS.thao);
  await page.goto("/leads");
  await expect(page.getByRole("button", { name: "Tạo lead" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nhập file" })).toHaveCount(0);
});
