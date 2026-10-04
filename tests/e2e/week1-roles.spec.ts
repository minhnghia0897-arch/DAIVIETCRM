import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Nghiệm thu tuần 1 theo vai trò (CLAUDE.md mục 15). Các bài sửa dữ liệu chạy tuần tự.
test.describe.configure({ mode: "serial" });

test("telesale chỉ thấy lead được giao cho mình", async ({ page }) => {
  await login(page, USERS.thao);
  await expect(page.getByRole("heading", { name: "Hàng chờ gọi" })).toBeVisible();
  await expect(page.getByText("Nguyễn Thị Thu")).toBeVisible();
  await expect(page.getByText("Phạm Ngọc Lan")).toHaveCount(0);
});

test("telesale không vào được trang phân quyền", async ({ page }) => {
  await login(page, USERS.thao);
  await page.goto("/settings/permissions");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});

test("sale admin thấy mọi lead và lead chưa phân", async ({ page }) => {
  await login(page, USERS.saleAdmin);
  await expect(page.getByRole("heading", { name: "Lead đang mở của showroom" })).toBeVisible();
  await expect(page.getByText("Lê Hoàng Phúc")).toBeVisible();
  await expect(page.getByText("Chưa phân").first()).toBeVisible();
});

test("Owner bật quyền nhạy cảm phải xác nhận và thấy toast", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Sửa dữ liệu một lần là đủ");
  await login(page, USERS.owner);
  await page.goto("/settings/permissions");
  await page.getByRole("switch", { name: "Xuất danh sách khách ra file, Sale admin" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Bật quyền nhạy cảm");
  await page.getByRole("button", { name: "Bật quyền" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã bật Xuất danh sách khách ra file cho Sale admin");
  await expect(
    page.getByRole("switch", { name: "Xuất danh sách khách ra file, Sale admin" }),
  ).toHaveAttribute("aria-checked", "true");
  // Cột Owner khóa, quyền chỉ Owner không có công tắc ở cột khác.
  await expect(page.getByRole("switch", { name: "Bật tắt quyền, Chủ hệ thống" })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Bật tắt quyền, Sale admin" })).toHaveCount(0);
});

test("Owner khóa telesale thì lead của họ về hàng chưa phân", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Sửa dữ liệu một lần là đủ");
  await login(page, USERS.owner);
  await page.goto("/settings/users");
  const row = page.getByRole("row", { name: /An/ });
  await row.getByRole("button", { name: "Khóa" }).click();
  await page.getByRole("button", { name: "Khóa người dùng" }).click();
  await expect(page.getByRole("status")).toContainText("Đã khóa An");
  await expect(row.getByText("Đã khóa")).toBeVisible();

  await page.goto("/home");
  const phuc = page.getByRole("listitem").filter({ hasText: "Phạm Ngọc Lan" });
  await expect(phuc.getByText("Chưa phân")).toBeVisible();
});

test("đăng xuất từ menu tài khoản", async ({ page }) => {
  await login(page, USERS.thao);
  await page.getByRole("button", { name: "Tài khoản" }).click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
});
