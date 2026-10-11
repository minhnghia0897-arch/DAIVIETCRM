import { expect, test } from "@playwright/test";

// Trang pháp lý công khai: Meta, Zalo đòi khi phát hành ứng dụng, phải mở được khi chưa đăng nhập.
for (const [path, heading] of [
  ["/privacy", "Chính sách quyền riêng tư"],
  ["/terms", "Điều khoản sử dụng"],
  ["/data-deletion", "Yêu cầu xóa dữ liệu"],
] as const) {
  test(`${path} mở được khi chưa đăng nhập`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  });
}
