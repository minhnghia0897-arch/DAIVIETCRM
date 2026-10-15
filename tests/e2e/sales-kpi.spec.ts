import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Doanh số từng sale trên bản thật (Owner chốt 15/10/2026): Owner đặt chỉ tiêu tháng, người bán thấy doanh số của
// mình trên Trang chủ và Hiệu suất của tôi, quản lý chỉ xem. Doanh số theo từng đơn kiểm ở messenger.spec.ts (đơn đi
// trọn từ cọc đến hoàn tất).

const THAO = "11111111-1111-4111-8111-000000000003";

test("Owner đặt chỉ tiêu tháng, telesale thấy doanh số so với chỉ tiêu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi dữ liệu: chạy một cỡ màn");
  await login(page, USERS.owner);
  await page.goto("/team/targets");
  await expect(page.getByRole("heading", { name: /^Chỉ tiêu doanh số tháng/ })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Thảo" });
  await row.getByLabel("Chỉ tiêu doanh số Thảo").fill("150");
  await row.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu chỉ tiêu");
  await expect(row.getByLabel("Chỉ tiêu doanh số Thảo")).toHaveValue("150");

  // Tổng quan đội của Owner có Thảo với chỉ tiêu vừa đặt.
  await page.goto("/team");
  const team = page.getByRole("table", { name: /^Doanh số từng người/ });
  await expect(team.getByRole("row").filter({ hasText: "Thảo" })).toContainText("150tr");

  // Thảo: Trang chủ có thẻ doanh số của mình, bấm sang Hiệu suất của tôi.
  await login(page, USERS.thao);
  const card = page.getByRole("region", { name: /^Doanh số của tôi/ });
  await expect(card).toContainText("150.000.000đ");
  await card.getByRole("link", { name: "Xem từng đơn" }).click();
  await expect(page).toHaveURL(new RegExp(`/team/people/${THAO}`));
  await expect(page.getByText("Hiệu suất của tôi").first()).toBeVisible();
  await expect(page.getByText("Chỉ tiêu tháng")).toBeVisible();
  await expect(page.getByRole("region", { name: "6 tháng gần nhất" })).toBeVisible();
});

test("sale admin xem chỉ tiêu, không sửa được, không thấy chỉ số của Owner", async ({ page }) => {
  await login(page, USERS.saleAdmin);
  await page.goto("/team/targets");
  const table = page.getByRole("table", { name: /^Chỉ tiêu/ });
  await expect(table.getByRole("row").filter({ hasText: "Thảo" })).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: "Hà Owner" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /^Chỉ tiêu doanh số/ })).toHaveCount(0);

  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "Từng người" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Hà Owner" })).toHaveCount(0);
  await page.goto("/team/people/11111111-1111-4111-8111-000000000001");
  await expect(page.getByRole("heading", { name: "Không tìm thấy" })).toBeVisible();
});

test("telesale không mở được màn chỉ tiêu", async ({ page }) => {
  await login(page, USERS.thao);
  await page.goto("/team/targets");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});
