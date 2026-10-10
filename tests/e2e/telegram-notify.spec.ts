import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Thông báo Telegram nối dữ liệu thật (CLAUDE.md 10.3 telegram_bot): link liên kết do database sinh, một lần,
// hết hạn 10 phút; thiết lập lưu vào notification_prefs; nhóm chỉ người có settings.integrations xem được.
// Tên bot lấy từ `integrations.config.botUsername`; dữ liệu giả trong supabase/seed.sql đã có sẵn.

test("tạo được link liên kết thật, mỗi lần một mã khác", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Sửa dữ liệu một lần là đủ");
  await login(page, USERS.an);
  await page.goto("/settings/notifications");

  const card = page.getByRole("region", { name: "Liên kết Telegram" });
  await expect(card).toContainText("Chưa liên kết");
  await card.getByRole("button", { name: "Tạo link liên kết" }).click();

  const link = card.getByRole("link", { name: "Mở Telegram" });
  await expect(link).toBeVisible();
  const first = await link.getAttribute("href");
  expect(first).toMatch(/^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=[0-9a-f]{32}$/);
  await expect(card).toContainText("Hết hạn sau 10 phút, dùng một lần");

  // Tạo link khác: mã mới, mã cũ hết hiệu lực (database cho hết hạn mã chưa dùng).
  await card.getByRole("button", { name: "Tạo link khác" }).click();
  await expect.poll(async () => link.getAttribute("href"), { message: "link phải đổi" }).not.toBe(first);
});

test("thiết lập thông báo lưu xuống database, tải lại vẫn còn", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Sửa dữ liệu một lần là đủ");
  await login(page, USERS.thao);
  await page.goto("/settings/notifications");

  // Đổi sang giá trị khác giá trị đang có, để chạy lại nhiều lần vẫn đúng.
  const detail = page.getByRole("radio", { name: "Chi tiết" });
  const wantDetail = !(await detail.isChecked());
  await (wantDetail ? detail : page.getByRole("radio", { name: "Rút gọn" })).click();

  const quiet = page.getByRole("region", { name: "Giờ im lặng" });
  const from = quiet.getByLabel("Im lặng từ");
  const wantFrom = (await from.inputValue()) === "21:30" ? "22:30" : "21:30";
  await from.selectOption(wantFrom);

  const sla = page.getByRole("switch", { name: "Lead quá hạn gọi" });
  const wantSla = (await sla.getAttribute("aria-checked")) === "true" ? "false" : "true";
  await sla.click();
  await expect(sla).toHaveAttribute("aria-checked", wantSla);

  await page.reload();
  await expect(detail).toBeChecked({ checked: wantDetail });
  await expect(from).toHaveValue(wantFrom);
  await expect(sla).toHaveAttribute("aria-checked", wantSla);
});

test("telesale không thấy danh sách nhóm Telegram của đội", async ({ page }) => {
  await login(page, USERS.thao);
  await page.goto("/settings/notifications");
  await expect(page.getByRole("region", { name: "Liên kết Telegram" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Nhóm Telegram của đội" })).toHaveCount(0);
});

test("Owner thấy danh sách nhóm Telegram", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/settings/notifications");
  await expect(page.getByRole("region", { name: "Nhóm Telegram của đội" })).toBeVisible();
});
