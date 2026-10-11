import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

test("Owner xem như telesale: thấy đúng dữ liệu của người đó, chỉ đọc, thoát được", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Một lần là đủ");
  await login(page, USERS.owner);
  await page.goto("/settings/users");
  await page.getByRole("row", { name: /Thảo/ }).getByRole("button", { name: "Xem như" }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Đang xem như Thảo (Telesale). Chỉ đọc.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hàng chờ gọi" })).toBeVisible();
  await expect(page.getByText("Nguyễn Thị Thu")).toBeVisible();
  await expect(page.getByText("Lê Hoàng Phúc")).toHaveCount(0);

  await page.goto("/settings/permissions");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();

  await page.goto("/home");
  await page.getByRole("button", { name: "Thoát" }).click();
  await expect(page).toHaveURL(/\/settings\/users$/);
  await expect(page.getByText("Đang xem như")).toHaveCount(0);
});
