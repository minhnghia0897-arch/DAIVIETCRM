import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Các phân hệ chạy bằng dữ liệu mô phỏng: kiểm tra lọc theo quyền giống luật sẽ áp ở database.

test("telesale chỉ thấy khách và đơn của mình, không thấy giá vốn", async ({ page }) => {
  await login(page, USERS.thao);
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Khách của tôi" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Trần Văn Nam" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Phạm Ngọc Lan" })).toHaveCount(0);

  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Đơn của tôi" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Q4-2610-0012" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Q4-2609-0008" })).toHaveCount(0);

  await page.goto("/products/p-x9");
  await expect(page.getByRole("columnheader", { name: "Giá vốn" })).toHaveCount(0);

  await page.goto("/team");
  await expect(page).toHaveURL(/\/team\/people\//);
  await expect(page.getByText("Hiệu suất của tôi").first()).toBeVisible();
});

test("Owner thấy cả đội, giá vốn và hồ sơ nhân sự", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/products/p-x9");
  await expect(page.getByRole("columnheader", { name: "Giá vốn" })).toBeVisible();

  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "Từng người" })).toBeVisible();
  await page.goto("/team/staff");
  await expect(page.getByRole("cell", { name: "Phương" })).toBeVisible();

  await page.goto("/orders/o-0011");
  await expect(page.getByText("Giữ bất ngờ: không liên hệ người nhận")).toBeVisible();
});

test("telesale không mở được hiệu suất và hồ sơ nhân sự của người khác", async ({ page }) => {
  await login(page, USERS.thao);
  const res = await page.goto("/team/people/11111111-1111-4111-8111-000000000004");
  expect(res?.status()).toBe(404);
  await page.goto("/team/staff");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});
