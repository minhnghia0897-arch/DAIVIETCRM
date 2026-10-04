import { expect, test, type Page } from "@playwright/test";

// Cài đặt, Tích hợp (CLAUDE.md 10.2, 11.2): nhập khóa, cấu hình kiểm bằng schema, kết nối OAuth hoặc khóa API,
// lỗi dễ hiểu khi thiếu điều kiện, gửi dữ liệu thử đi đúng đường lead thật, tạm dừng, ngắt.

async function as(page: Page, role: "owner" | "sale_admin" | "telesale", path: string) {
  await page.goto("login/");
  await page.evaluate((r) => localStorage.setItem("dv_demo_role", r), role);
  await page.goto(path);
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Luồng dài chạy trên laptop");
});

async function setupMeta(page: Page) {
  const row = page.getByRole("listitem", { name: "Form quảng cáo Facebook" });
  await expect(row.getByRole("button", { name: "Kết nối" })).toBeDisabled();
  await row.getByRole("button", { name: "Form quảng cáo Facebook" }).click();

  await row.getByRole("tab", { name: "Cấu hình" }).click();
  await row.getByLabel("ID Page Facebook").fill("abc");
  await row.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(row.getByLabel("Lỗi cấu hình")).toContainText("ID Page là dãy số");
  await row.getByLabel("ID Page Facebook").fill("104857300000001");
  await row.getByLabel("ID các form cần nhận").fill("2200000000001");
  await row.getByLabel('Trường lead cho câu "Họ và tên"').selectOption("full_name");
  await row.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(row.getByLabel("Lỗi cấu hình")).toHaveCount(0);

  await row.getByRole("tab", { name: "Bí mật" }).click();
  await row.getByLabel(/App Secret/).fill("khoa-bi-mat-thu");
  await row.getByRole("button", { name: "Lưu khóa" }).click();
  await expect(row.getByText(/Đã có, cập nhật/)).toBeVisible();
  // Khóa không bao giờ hiện lại.
  await expect(page.getByText("khoa-bi-mat-thu")).toHaveCount(0);
  await expect(row.getByLabel(/App Secret/)).toHaveValue("");
  return row;
}

test("thiếu điều kiện thì kết nối báo lỗi dễ hiểu; đủ điều kiện thì kết nối, gửi lead thử vào CRM", async ({
  page,
}) => {
  await as(page, "owner", "settings/integrations/");
  const row = await setupMeta(page);
  // Đánh dấu hai điều kiện, bỏ sót quyền truy cập lead trong Business Manager.
  await row.getByRole("tab", { name: "Điều kiện" }).click();
  await row.getByLabel(/ứng dụng Meta đứng tên/).check();
  await row.getByLabel(/xác minh doanh nghiệp/).check();

  await row.getByRole("button", { name: "Kết nối", exact: true }).click();
  await row
    .getByRole("dialog", { name: /Cấp quyền/ })
    .getByRole("button", { name: "Cho phép" })
    .click();
  await expect(row.getByRole("alert")).toContainText("quản lý quyền truy cập lead của Business Manager");
  await expect(page.getByRole("link", { name: /Đấu nối lỗi/ })).toBeVisible();

  await row.getByRole("tab", { name: "Điều kiện" }).click();
  for (const label of [/ứng dụng Meta đứng tên/, /xác minh doanh nghiệp/, /quyền truy cập lead/])
    await row.getByLabel(label).check();
  await row.getByRole("button", { name: "Kết nối lại" }).click();
  await row
    .getByRole("dialog", { name: /Cấp quyền/ })
    .getByRole("button", { name: "Cho phép" })
    .click();
  await expect(row.getByText("Đã kết nối", { exact: true })).toBeVisible();
  await expect(row.getByText(/Token còn 60 ngày/)).toBeVisible();

  await row.getByRole("button", { name: "Gửi dữ liệu thử" }).click();
  await row.getByRole("tab", { name: /Nhật ký/ }).click();
  await expect(row.getByLabel("Nhật ký đấu nối")).toContainText("Lead thử từ công cụ test lead của Meta");
  await page
    .getByRole("navigation", { name: "Ứng dụng" })
    .getByRole("link", { name: "Cơ hội", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Lead thử Facebook/ })).toBeVisible();
});

test("tạm dừng, chạy lại, ngắt kết nối thu hồi token, giữ App Secret", async ({ page }) => {
  await as(page, "owner", "settings/integrations/");
  const row = await setupMeta(page);
  await row.getByRole("tab", { name: "Điều kiện" }).click();
  for (const label of [/ứng dụng Meta đứng tên/, /xác minh doanh nghiệp/, /quyền truy cập lead/])
    await row.getByLabel(label).check();
  await row.getByRole("button", { name: "Kết nối", exact: true }).click();
  await row
    .getByRole("dialog", { name: /Cấp quyền/ })
    .getByRole("button", { name: "Cho phép" })
    .click();
  await row.getByRole("button", { name: "Tạm dừng" }).click();
  await expect(row.getByText("Tạm dừng", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Chạy lại" }).click();
  await row.getByRole("button", { name: "Ngắt kết nối" }).click();
  await expect(row.getByText("Chưa kết nối", { exact: true })).toBeVisible();
  await row.getByRole("tab", { name: "Bí mật" }).click();
  await expect(row.getByText(/Đã có, cập nhật/)).toHaveCount(1);
  await expect(row.getByRole("button", { name: "Kết nối", exact: true })).toBeEnabled();
});

test("khóa API: email SMTP kết nối khi đủ cấu hình và khóa; đấu nối chưa làm hiện Sắp có", async ({
  page,
}) => {
  await as(page, "owner", "settings/integrations/");
  const row = page.getByRole("listitem", { name: "Email gửi lời mời" });
  await row.getByRole("button", { name: "Email gửi lời mời" }).click();
  await row.getByRole("tab", { name: "Cấu hình" }).click();
  await row.getByLabel("Máy chủ SMTP").fill("smtp.example.com");
  await row.getByLabel("Cổng").fill("587");
  await row.getByLabel("Tên đăng nhập").fill("crm");
  await row.getByLabel("Địa chỉ gửi").fill("no-reply@daivietshowroomq4.vn");
  await row.getByRole("button", { name: "Lưu cấu hình" }).click();
  await row.getByRole("tab", { name: "Bí mật" }).click();
  await row.getByLabel("Mật khẩu SMTP").fill("x");
  await row.getByRole("button", { name: "Lưu khóa" }).click();
  await row.getByRole("tab", { name: "Điều kiện" }).click();
  await row.getByLabel(/Đã chốt tên miền/).check();
  await row.getByLabel(/SPF và DKIM/).check();
  await row.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(row.getByText("Đã kết nối", { exact: true })).toBeVisible();

  const shop = page.getByRole("listitem", { name: "TikTok Shop" });
  await expect(shop.getByText("Sắp có", { exact: true })).toBeVisible();
  await expect(shop.getByRole("button", { name: "Kết nối" })).toHaveCount(0);

  await page.getByRole("button", { name: "Tài khoản", exact: true }).click();
  await page.getByRole("menuitem", { name: "Nhật ký kiểm toán" }).click();
  await expect(page.getByRole("cell", { name: "Thay khóa bí mật" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Kết nối đấu nối", exact: true })).toBeVisible();
});

test("sale admin không vào được Tích hợp", async ({ page }) => {
  await as(page, "sale_admin", "settings/integrations/");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});
