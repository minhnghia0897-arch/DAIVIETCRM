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
  await expect(row.getByText("Còn thiếu: App Secret của ứng dụng Meta, ID Page Facebook")).toBeVisible();
  // Thiết lập mở thẳng tab còn thiếu (khóa trước).
  await row.getByRole("button", { name: "Thiết lập" }).click();
  await expect(row.getByRole("tab", { name: "Bí mật" })).toHaveAttribute("aria-selected", "true");

  await row.getByRole("tab", { name: "Cấu hình" }).click();
  await row.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(row.getByLabel("Lỗi cấu hình")).toContainText("ID Page Facebook: Chưa nhập");
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

  await expect(page.getByText("Sắp có", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Tài khoản", exact: true }).click();
  await page.getByRole("menuitem", { name: "Nhật ký kiểm toán" }).click();
  await expect(page.getByRole("cell", { name: "Thay khóa bí mật" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Kết nối đấu nối", exact: true })).toBeVisible();
});

test("đấu nối giai đoạn sau: form TikTok đưa lead thử vào CRM, kho lưu trữ chỉ cần bật, trợ lý AI mặc định tắt chức năng", async ({
  page,
}) => {
  await as(page, "owner", "settings/integrations/");
  const tk = page.getByRole("listitem", { name: "Form quảng cáo TikTok" });
  await tk.getByRole("button", { name: "Thiết lập" }).click();
  await tk.getByLabel(/App secret của ứng dụng TikTok/).fill("x");
  await tk.getByRole("button", { name: "Lưu khóa" }).click();
  await tk.getByRole("tab", { name: "Cấu hình" }).click();
  await tk.getByLabel("ID tài khoản quảng cáo TikTok").fill("7200000000000000001");
  await tk.getByLabel("ID các form cần nhận").fill("7300000000001");
  await tk.getByRole("button", { name: "Lưu cấu hình" }).click();
  await tk.getByRole("tab", { name: "Điều kiện" }).click();
  await tk.getByLabel(/ủy quyền cho ứng dụng/).check();
  await tk.getByRole("button", { name: "Kết nối", exact: true }).click();
  await tk
    .getByRole("dialog", { name: /Cấp quyền/ })
    .getByRole("button", { name: "Cho phép" })
    .click();
  await expect(tk.getByText("Đã kết nối", { exact: true })).toBeVisible();
  await tk.getByRole("button", { name: "Gửi dữ liệu thử" }).click();

  const fs = page.getByRole("listitem", { name: "Lưu video bàn giao" });
  await fs.getByRole("button", { name: "Thiết lập" }).click();
  await fs.getByLabel("Nơi lưu").selectOption("supabase");
  await fs.getByLabel("Thời hạn link xem (phút)").fill("90");
  await fs.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(fs.getByLabel("Lỗi cấu hình")).toContainText("Thời hạn link từ 1 đến 60 phút");
  await fs.getByLabel("Thời hạn link xem (phút)").fill("10");
  await fs.getByRole("button", { name: "Lưu cấu hình" }).click();
  await fs.getByRole("button", { name: "Bật", exact: true }).click();
  await expect(fs.getByText("Đã kết nối", { exact: true })).toBeVisible();

  const ai = page.getByRole("listitem", { name: "Trợ lý AI" });
  await ai.getByRole("button", { name: "Trợ lý AI", exact: true }).click();
  await expect(ai.getByText(/Mọi kết quả AI là đề xuất có người xác nhận/)).toBeVisible();
  await ai.getByRole("tab", { name: "Cấu hình" }).click();
  for (const box of await ai
    .getByRole("group", { name: /Chức năng bật/ })
    .getByRole("checkbox")
    .all())
    await expect(box).not.toBeChecked();

  const zns = page.getByRole("listitem", { name: "Tin ZNS" });
  await zns.getByRole("button", { name: "Tin ZNS" }).click();
  await expect(zns.getByText(/Chỉ gửi tới số Việt Nam/)).toBeVisible();

  await page
    .getByRole("navigation", { name: "Ứng dụng" })
    .getByRole("link", { name: "Cơ hội", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Lead thử TikTok/ })).toBeVisible();
});

test("sale admin không vào được Tích hợp", async ({ page }) => {
  await as(page, "sale_admin", "settings/integrations/");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});
