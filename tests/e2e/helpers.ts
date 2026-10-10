import { expect, type Page } from "@playwright/test";

// Tài khoản giả trong supabase/seed.sql. Chạy `pnpm db:reset` trước khi chạy e2e.
export const USERS = {
  owner: "owner@example.test",
  saleAdmin: "saleadmin@example.test",
  thao: "thao@example.test",
  an: "an@example.test",
  marketing: "marketing@example.test",
} as const;

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill("matkhau-dev-123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/home$/);
}
