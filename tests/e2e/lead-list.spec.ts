import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Thu lead và giao lead trên bản thật (migration 20261007000700_lead_intake.sql): nhập nhanh, chống trùng theo số,
// sale admin giao lead, telesale chỉ thấy lead của mình và không có nút giao. Ghi vào database nên chỉ chạy một cỡ
// màn, sau `pnpm db:reset`. Lead vào ngoài khung gọi của khách thì chờ khung, nên câu báo chấp nhận cả hai trường hợp.

// Số riêng cho mỗi lần chạy, để chạy lại không đụng lead của lần trước.
const phone = `09${String(Date.now()).slice(-8)}`;
const name = `Khách thử ${phone.slice(-4)}`;

test("nhập lead, chống trùng, giao cho telesale", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
  await login(page, USERS.saleAdmin);
  await page.goto("/leads");
  await expect(page.getByRole("heading", { name: "Lead" })).toBeVisible();

  await page.getByRole("button", { name: "Tạo lead" }).click();
  const form = page.getByRole("form", { name: "Tạo lead" });
  await form.getByLabel("Họ tên").fill(name);
  await form.getByLabel("Số điện thoại").fill(phone);
  await form.getByLabel("Nguồn").selectOption({ label: "Khách đến showroom" });
  await form.getByRole("button", { name: "Lưu lead" }).click();
  await expect(form.getByRole("status")).toContainText(/Đã tạo lead/);

  // Cùng số lần nữa: không tạo lead mới.
  await form.getByLabel("Họ tên").fill(`${name} (lần 2)`);
  await form.getByLabel("Số điện thoại").fill(phone);
  await form.getByRole("button", { name: "Lưu lead" }).click();
  await expect(form.getByRole("status")).toContainText("Khách đã có lead đang mở");

  // Sale admin giao lead cho An.
  await page.goto(`/leads?view=open&q=${encodeURIComponent(name)}`);
  const table = page.getByRole("region", { name: "Lead đang mở của showroom" });
  await expect(table.getByRole("link", { name })).toHaveCount(1);
  await table.getByRole("checkbox", { name: `Chọn ${name}` }).check();
  const bulk = page.getByRole("region", { name: "Giao hàng loạt" });
  const an = await bulk.locator("option", { hasText: /^An · / }).getAttribute("value");
  await bulk.getByLabel("Giao cho").selectOption(an!);
  await bulk.getByRole("button", { name: "Giao cho An" }).click();
  // Lead có thể đã được phân tự động cho An: khi đó không có gì phải đổi.
  await expect(
    page.getByRole("status").filter({ hasText: /Đã giao 1 lead cho An|Không có lead nào/ }),
  ).toBeVisible();

  // An thấy lead trong "Của tôi", không có ô chọn để giao.
  await page.context().clearCookies();
  await login(page, USERS.an);
  await page.goto("/leads");
  const mine = page.getByRole("region", { name: "Lead của tôi" });
  await expect(mine.getByRole("link", { name })).toBeVisible();
  await expect(mine.getByRole("checkbox")).toHaveCount(0);
  await mine.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
});

test("telesale không thấy lead của người khác trong danh sách", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Chỉ cần kiểm một cỡ màn");
  await login(page, USERS.thao);
  await page.goto("/leads?view=unassigned");
  await expect(page.getByRole("region", { name: "Lead của tôi" })).toBeVisible();
  // Không có quyền xem mọi lead thì mọi bộ lọc đều chỉ trả lead của mình (RLS); lead của An không lọt ra.
  await expect(page.getByRole("link", { name: "Phạm Ngọc Lan" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Chưa phân" })).toHaveCount(0);
});
