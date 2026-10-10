import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Chuông thông báo bản thật (bảng notifications): sale admin giao lead cho An, An thấy thông báo chưa đọc, bấm mở
// đúng chỗ thì thông báo thành đã đọc. Ghi vào database nên chỉ chạy một cỡ màn, sau `pnpm db:reset`.

const phone = `+1 415 555 ${String(Date.now()).slice(-4)}`;
const name = `Khách chuông ${phone.slice(-4)}`;

test("giao lead thì người nhận thấy trên chuông", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
  await login(page, USERS.saleAdmin);
  await page.goto("/leads");
  await page.getByRole("button", { name: "Tạo lead" }).click();
  const form = page.getByRole("form", { name: "Tạo lead" });
  await form.getByLabel("Họ tên").fill(name);
  await form.getByLabel("Số điện thoại").fill(phone);
  await form.getByRole("button", { name: "Lưu lead" }).click();
  await expect(form.getByRole("status")).toContainText(/Đã tạo lead/);

  await page.goto(`/leads?view=open&q=${encodeURIComponent(name)}`);
  await page.getByRole("checkbox", { name: `Chọn ${name}` }).check();
  const bulk = page.getByRole("region", { name: "Giao hàng loạt" });
  const an = await bulk.locator("option", { hasText: /^An · / }).getAttribute("value");
  await bulk.getByLabel("Giao cho").selectOption(an!);
  await bulk.getByRole("button", { name: "Giao cho An" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /Đã giao 1 lead cho An|Không có lead nào/ }),
  ).toBeVisible();

  await page.context().clearCookies();
  await login(page, USERS.an);
  // Các bài khác chạy song song cũng giao lead cho An, nên chỉ so "ít đi" thay vì một con số cố định.
  const bell = page.getByRole("button", { name: /^Thông báo: [1-9]\d* chưa đọc$/ });
  await expect(bell).toBeVisible();
  const unread = async () =>
    Number(
      (await page.getByRole("button", { name: /^Thông báo:/ }).getAttribute("aria-label"))!.match(/\d+/)![0],
    );
  const before = await unread();
  await bell.click();
  const box = page.getByRole("dialog", { name: "Thông báo" });
  await box
    .getByRole("link", { name: /Anh chị được giao một lead/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/leads/);
  await expect.poll(unread).toBeLessThan(before);

  // Đánh dấu đã đọc hết thì chuông về 0.
  await expect(async () => {
    await page.reload();
    if ((await unread()) > 0) {
      await page.getByRole("button", { name: /^Thông báo:/ }).click();
      await page.getByRole("button", { name: "Đánh dấu đã đọc hết" }).click();
      await page.reload();
    }
    expect(await unread()).toBe(0);
  }).toPass({ timeout: 20_000 });
});
