import { expect, test } from "@playwright/test";

test("trang chủ hiện tiếng Việt và không tràn ngang", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Đại Việt CRM" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
