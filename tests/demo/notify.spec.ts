import { expect, test, type Page } from "@playwright/test";

// Thông báo Telegram cho nhân viên và Mini App (CLAUDE.md 10.3 telegram_bot): tự chọn mức chi tiết,
// tin không có số điện thoại, nút nhanh dưới tin, Mini App theo quyền.

async function as(page: Page, role: "owner" | "sale_admin" | "telesale", path: string) {
  await page.goto("login/");
  await page.evaluate((r) => localStorage.setItem("dv_demo_role", r), role);
  await page.goto(path);
}

test("telesale gửi tin thử, đổi mức chi tiết; tin không có số điện thoại", async ({ page }) => {
  await as(page, "telesale", "settings/notifications/");
  await expect(page.getByText("Đã liên kết @thao_daiviet")).toBeVisible();
  // Telesale không có quyền đấu nối nên không thấy sự kiện đấu nối lỗi.
  await expect(page.getByText("Đấu nối bị lỗi")).toHaveCount(0);

  await page.getByRole("button", { name: "Gửi tin thử" }).click();
  const log = page.getByRole("log", { name: "Tin bot gửi" });
  await expect(log).toContainText("Lead mới:");
  await expect(log).not.toContainText(/\d{3}[ .]?\d{3,}/);

  await page.getByRole("radio", { name: /Rút gọn/ }).check();
  await expect(log).toContainText("Anh chị có 1 lead mới");
  await expect(log.getByRole("button", { name: "Mở và gọi" }).first()).toBeVisible();
});

test("Mini App: telesale có Việc, Lead, Đơn, không có Duyệt; mở lead ghi nhanh kết quả", async ({ page }) => {
  await as(page, "telesale", "m/");
  const tabs = page.getByRole("tablist", { name: "Mini App" });
  await expect(tabs.getByRole("tab", { name: /Việc/ })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /Duyệt/ })).toHaveCount(0);
  await tabs.getByRole("tab", { name: /Lead/ }).click();
  await page.locator(".ma-row").first().click();
  await expect(page.getByText("Ghi nhanh kết quả cuộc gọi")).toBeVisible();
});

test("Mini App: Owner có tab Duyệt", async ({ page }) => {
  await as(page, "owner", "m/");
  await expect(
    page.getByRole("tablist", { name: "Mini App" }).getByRole("tab", { name: /Duyệt/ }),
  ).toBeVisible();
});

test("trả lời tin bot lưu ghi chú vào hồ sơ; ảnh chuyển khoản vào tin đơn thành khoản chờ xác nhận", async ({
  page,
}) => {
  await as(page, "telesale", "settings/notifications/");
  await page.getByRole("button", { name: "Gửi tin thử" }).click();
  const log = page.getByRole("log", { name: "Tin bot gửi" });

  await log
    .getByRole("button", { name: /Trả lời tin: Lead mới/ })
    .first()
    .click();
  await page.getByLabel("Nhắn cho bot").fill("Khách hẹn 21h gọi lại, số mới 0912 345 678");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(log).toContainText("Đã lưu ghi chú vào hồ sơ");
  await expect(log).toContainText("091•••678");
  await expect(log).not.toContainText("345 678");

  await log
    .getByRole("button", { name: /Trả lời tin: Đơn Q4-/ })
    .first()
    .click();
  await page
    .getByLabel("Đính kèm ảnh")
    .locator("input")
    .setInputFiles({
      name: "chuyen-khoan.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
    });
  await page.getByLabel("Số tiền trên ảnh").fill("5000000");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(log).toContainText("chờ người có quyền xác nhận tiền về");

  await page.getByRole("button", { name: "/viec" }).click();
  await expect(log).toContainText(/Việc hôm nay|không còn việc/);
});
