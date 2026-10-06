import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Nhãn "Dữ liệu mô phỏng" ở thanh tiện ích chỉ hiện ở màn chưa nối database (lib/nav.ts, LIVE_SCREENS).
// Để nhãn này còn đáng tin: màn đã đọc dữ liệu thật thì không được nhắc mô phỏng nữa.

test("nhãn Dữ liệu mô phỏng chỉ hiện ở màn còn mô phỏng", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Chỉ cần kiểm một cỡ màn");
  await login(page, USERS.owner);
  const label = page.getByRole("contentinfo", { name: "Tiện ích" }).getByText("Dữ liệu mô phỏng");

  for (const path of ["/home", "/chat", "/settings/notifications", "/settings/integrations"]) {
    await page.goto(path);
    await expect(label, `${path} đã nối database, không được nhắc mô phỏng`).toHaveCount(0);
  }
  for (const path of ["/tasks", "/inbox", "/products"]) {
    await page.goto(path);
    await expect(label, `${path} còn mô phỏng, phải nhắc`).toBeVisible();
  }
});
