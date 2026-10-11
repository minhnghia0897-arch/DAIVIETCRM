import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Chính sách bản thật: Owner tạo khuyến mãi nháp, Thử chính sách chạy đúng hàm định giá dùng chung.
// Để nháp để không đổi giá của các kiểm thử lên đơn khác.

test("Owner tạo khuyến mãi nháp và thử trước khi bật", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi dữ liệu, chỉ chạy một cỡ màn");
  await login(page, USERS.owner);
  await page.goto("/policies");
  await page.getByRole("button", { name: "Thêm chính sách" }).click();
  const form = page.getByRole("form", { name: "Thêm chính sách" });
  await form.getByLabel("Loại chính sách").selectOption("promotion");
  await form.getByLabel("Tên chính sách").fill("Thử KM 10%");
  await form.getByLabel("Giảm phần trăm").fill("10");
  await form.getByRole("button", { name: "Lưu" }).click();
  const list = page.getByRole("region", { name: "Danh sách chính sách" });
  await expect(list).toContainText("Thử KM 10%");

  const tester = page.getByRole("region", { name: "Thử chính sách" });
  await tester.getByLabel("Sản phẩm thử").selectOption({ label: "Ghế massage Daikiosan DC302 (DC302)" });
  const result = tester.getByRole("group", { name: "Kết quả định giá" });
  // Mặc định tính cả chính sách nháp để thử trước khi bật; bỏ chọn thì chỉ còn chính sách đang chạy.
  await expect(result).toContainText("Thử KM 10%");
  await expect(result).toContainText("44.100.000");
  await tester.getByLabel(/Tính cả chính sách nháp/).uncheck();
  await expect(result).not.toContainText("Thử KM 10%");
  await expect(result).toContainText("49.000.000");
});

test("telesale xem chính sách nhưng không sửa được", async ({ page }) => {
  await login(page, USERS.thao);
  await page.goto("/policies");
  await expect(page.getByRole("heading", { name: "Chính sách", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm chính sách" })).toHaveCount(0);
});
