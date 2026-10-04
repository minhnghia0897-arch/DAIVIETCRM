import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Mọi màn hình của bản thật mở được theo quyền, không lỗi, không tràn ngang; màn ngoài quyền bị chặn.

const OWNER_SCREENS: [string, string][] = [
  ["/tasks", "Việc cần làm"],
  ["/opportunities", "Cơ hội"],
  ["/households", "Hộ gia đình"],
  ["/deliveries", "Đơn & giao lắp"],
  ["/inbox", "Hội thoại"],
  ["/channels", "Kênh & nội dung"],
  ["/reports", "Báo cáo"],
  ["/agents", "Agent"],
  ["/policies", "Chính sách"],
  ["/settings/integrations", "Kênh khách hàng"],
  ["/settings/markets", "Thị trường"],
  ["/settings/shifts", "Ca trực"],
  ["/settings/task-rules", "Luật sinh việc"],
  ["/settings/call-mode", "Chế độ gọi"],
  ["/settings/catalog", "Danh mục tra cứu"],
  ["/settings/assignment", "Phân lead"],
  ["/settings/audit", "Nhật ký kiểm toán"],
  ["/inventory", "Tồn kho"],
  ["/orders", "Đơn hàng"],
  ["/orders/o-0014", "Đơn Q4-2610-0014"],
  ["/customers/c-nam", "Trần Văn Nam"],
  ["/team/targets", "Đội ngũ: chỉ tiêu"],
  ["/team/absences", "Đội ngũ: nghỉ và trực"],
  ["/team/coaching", "Đội ngũ: kèm cặp"],
  ["/team/offboarding", "Đội ngũ: bàn giao"],
];

test("Owner mở được mọi màn hình", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, USERS.owner);
  for (const [path, heading] of OWNER_SCREENS) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true }).first(), path).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, path).toBe(false);
  }
  expect(errors).toEqual([]);
});

test("telesale bị chặn ở màn ngoài quyền", async ({ page }) => {
  await login(page, USERS.thao);
  for (const path of [
    "/agents",
    "/channels",
    "/settings/integrations",
    "/settings/audit",
    "/settings/markets",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" }), path).toBeVisible();
  }
  await page.goto("/policies");
  await expect(page.getByRole("heading", { name: "Chính sách", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sửa" })).toHaveCount(0);
});

test("đường dẫn không có thì báo tiếng Việt", async ({ page }) => {
  await login(page, USERS.thao);
  const res = await page.goto("/khong-co-trang-nay");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Không tìm thấy" })).toBeVisible();
});
