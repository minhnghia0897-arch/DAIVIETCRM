import { expect, test, type Page } from "@playwright/test";

// Khu Marketing ở bản demo: vai trò Marketing vào thẳng Tổng quan, không thấy menu lead; telesale không thấy Marketing.

async function as(page: Page, role: "owner" | "telesale" | "marketing", path: string) {
  await page.goto("login/");
  await page.evaluate((r) => localStorage.setItem("dv_demo_role", r), role);
  await page.goto(path);
}

test("Marketing vào thẳng Tổng quan, có tab Chiến dịch, không có menu Lead", async ({ page }) => {
  await as(page, "marketing", "home/");
  await expect(page.getByRole("heading", { name: "Tổng quan", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Theo chiến dịch" })).toContainText("Quà 20/10 trong nước");
  const nav = page.getByRole("navigation", { name: "Ứng dụng" });
  await expect(nav.getByRole("link", { name: "Lead", exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Marketing" }).getByRole("link", { name: "Chiến dịch" }).click();
  const item = page.getByRole("listitem", { name: "Máy lọc nước mùa Tết" });
  await expect(item).toContainText("Chờ duyệt ngân sách");
  await expect(item.getByRole("button", { name: "Gửi Owner duyệt" })).toBeVisible();
});

test("telesale không vào được Marketing", async ({ page }) => {
  await as(page, "telesale", "marketing/");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});
