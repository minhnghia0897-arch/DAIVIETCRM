import { expect, test, type Page } from "@playwright/test";

// Cài đặt, Tích hợp (CLAUDE.md 10.2, 11.2). Kết nối nhanh: chỉ dán khóa và ô không đoán được; Page, form, OA chọn
// từ danh sách sau khi đăng nhập; kết nối xong tự gửi dữ liệu thử. Tab chi tiết vẫn sửa được mọi cấu hình.

async function as(page: Page, role: "owner" | "sale_admin" | "telesale", path: string) {
  await page.goto("login/");
  await page.evaluate((r) => localStorage.setItem("dv_demo_role", r), role);
  await page.goto(path);
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Luồng dài chạy trên laptop");
});

const row = (page: Page, name: string) => page.getByRole("listitem", { name });

async function allow(r: ReturnType<typeof row>) {
  await r
    .getByRole("dialog", { name: /Cấp quyền/ })
    .getByRole("button", { name: "Cho phép" })
    .click();
}

test("Form Facebook: dán App Secret, đăng nhập, chọn Page từ danh sách là chạy; lead thử vào CRM", async ({
  page,
}) => {
  await as(page, "owner", "settings/integrations/");
  const meta = row(page, "Form quảng cáo Facebook");
  // Page và form chọn sau khi đăng nhập nên dòng tóm tắt chỉ còn thiếu khóa.
  await expect(meta.getByText("Còn thiếu: App Secret của ứng dụng Meta.")).toBeVisible();

  await meta.getByRole("button", { name: "Kết nối", exact: true }).click();
  const quick = meta.getByRole("form", { name: "Kết nối nhanh Form quảng cáo Facebook" });
  await quick.getByRole("button", { name: "Đăng nhập Facebook và kết nối" }).click();
  await expect(quick.getByLabel("Còn thiếu để kết nối")).toContainText("Chưa nhập App Secret");

  await expect(quick.getByLabel("Địa chỉ nhận dữ liệu")).toHaveValue(/\/api\/webhooks\/meta$/);
  await quick.getByLabel(/App Secret/).fill("khoa-bi-mat-thu");
  await quick.getByRole("button", { name: "Đăng nhập Facebook và kết nối" }).click();
  const dialog = quick.getByRole("dialog", { name: /Cấp quyền/ });
  await expect(dialog.getByLabel("Page Facebook")).toHaveValue("104857300000001");
  await expect(dialog.getByLabel("Ghế massage, người Việt tại Hàn")).toBeChecked();
  // Chưa xác nhận các bước chuẩn bị: nhà cung cấp từ chối, lỗi dễ hiểu.
  await allow(meta);
  await expect(meta.getByRole("alert")).toContainText("Chưa có ứng dụng Meta đứng tên showroom");
  await expect(page.getByRole("link", { name: /Đấu nối lỗi/ })).toBeVisible();
  await expect(page.getByText("khoa-bi-mat-thu")).toHaveCount(0);

  await meta.getByRole("button", { name: "Kết nối lại" }).click();
  await expect(quick.getByLabel(/App Secret/)).toHaveAttribute(
    "placeholder",
    "Đã có, để trống nếu giữ nguyên",
  );
  await quick.getByLabel(/Đã làm xong các bước chuẩn bị/).check();
  await quick.getByRole("button", { name: "Đăng nhập Facebook và kết nối" }).click();
  await allow(meta);
  await expect(meta.getByText("Đã kết nối", { exact: true })).toBeVisible();
  await expect(meta.getByText(/Token còn 60 ngày/)).toBeVisible();

  // Kết nối xong tự gửi dữ liệu thử; ánh xạ câu hỏi được đoán sẵn.
  await meta.getByRole("button", { name: "Form quảng cáo Facebook" }).click();
  await meta.getByRole("tab", { name: /Nhật ký/ }).click();
  await expect(meta.getByLabel("Nhật ký đấu nối")).toContainText("Lead thử từ công cụ test lead của Meta");
  await meta.getByRole("tab", { name: "Cấu hình" }).click();
  await expect(meta.getByLabel('Trường lead cho câu "Họ và tên"')).toHaveValue("full_name");
  await page
    .getByRole("navigation", { name: "Ứng dụng" })
    .getByRole("link", { name: "Cơ hội", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Lead thử Facebook/ })).toBeVisible();
});

test("email SMTP: cổng điền sẵn, dán mật khẩu và vài ô là kết nối; ghi nhật ký kiểm toán", async ({
  page,
}) => {
  await as(page, "owner", "settings/integrations/");
  const smtp = row(page, "Email gửi lời mời");
  await smtp.getByRole("button", { name: "Kết nối", exact: true }).click();
  const quick = smtp.getByRole("form", { name: /Kết nối nhanh/ });
  await expect(quick.getByLabel("Cổng")).toHaveCount(0);
  await quick.getByLabel("Mật khẩu SMTP").fill("x");
  await quick.getByLabel("Máy chủ SMTP").fill("smtp.example.com");
  await quick.getByLabel("Tên đăng nhập").fill("crm");
  await quick.getByLabel("Địa chỉ gửi").fill("sai");
  await quick.getByRole("button", { name: "Kiểm tra và kết nối" }).click();
  await expect(quick.getByLabel("Còn thiếu để kết nối")).toContainText("Địa chỉ gửi chưa đúng dạng email");
  await quick.getByLabel("Địa chỉ gửi").fill("no-reply@daivietshowroomq4.vn");
  await quick.getByLabel(/Đã làm xong các bước chuẩn bị/).check();
  await quick.getByRole("button", { name: "Kiểm tra và kết nối" }).click();
  await expect(smtp.getByText("Đã kết nối", { exact: true })).toBeVisible();

  await smtp.getByRole("button", { name: "Email gửi lời mời" }).click();
  await smtp.getByRole("tab", { name: "Cấu hình" }).click();
  await expect(smtp.getByLabel("Cổng")).toHaveValue("587");

  await page.getByRole("button", { name: "Tài khoản", exact: true }).click();
  await page.getByRole("menuitem", { name: "Nhật ký kiểm toán" }).click();
  await expect(page.getByRole("cell", { name: "Thay khóa bí mật" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Kết nối đấu nối", exact: true })).toBeVisible();
});

test("tạm dừng, chạy lại, ngắt kết nối thu hồi token đăng nhập, giữ App Secret", async ({ page }) => {
  await as(page, "owner", "settings/integrations/");
  const meta = row(page, "Form quảng cáo Facebook");
  await meta.getByRole("button", { name: "Kết nối", exact: true }).click();
  const quick = meta.getByRole("form", { name: /Kết nối nhanh/ });
  await quick.getByLabel(/App Secret/).fill("x");
  await quick.getByLabel(/Đã làm xong các bước chuẩn bị/).check();
  await quick.getByRole("button", { name: /Đăng nhập Facebook/ }).click();
  await allow(meta);
  await meta.getByRole("button", { name: "Tạm dừng" }).click();
  await expect(meta.getByText("Tạm dừng", { exact: true })).toBeVisible();
  await meta.getByRole("button", { name: "Chạy lại" }).click();
  await meta.getByRole("button", { name: "Ngắt kết nối" }).click();
  await expect(meta.getByText("Chưa kết nối", { exact: true })).toBeVisible();
  await meta.getByRole("button", { name: "Form quảng cáo Facebook" }).click();
  await meta.getByRole("tab", { name: "Bí mật" }).click();
  await expect(meta.getByText(/Đã có, cập nhật/)).toHaveCount(1);
  await expect(meta.getByText(/Còn thiếu/)).toHaveCount(0);
});

test("đấu nối giai đoạn sau: form TikTok đưa lead thử vào CRM, kho lưu trữ chỉ cần bật, AI mặc định tắt chức năng", async ({
  page,
}) => {
  await as(page, "owner", "settings/integrations/");
  const tk = row(page, "Form quảng cáo TikTok");
  await tk.getByRole("button", { name: "Kết nối", exact: true }).click();
  const quick = tk.getByRole("form", { name: /Kết nối nhanh/ });
  await quick.getByLabel(/App secret của ứng dụng TikTok/).fill("x");
  await quick.getByLabel(/Đã làm xong các bước chuẩn bị/).check();
  await quick.getByRole("button", { name: "Đăng nhập TikTok và kết nối" }).click();
  await allow(tk);
  await expect(tk.getByText("Đã kết nối", { exact: true })).toBeVisible();

  const fs = row(page, "Lưu video bàn giao");
  await fs.getByRole("button", { name: "Bật", exact: true }).click();
  await fs
    .getByRole("form", { name: /Kết nối nhanh/ })
    .getByRole("button", { name: "Bật" })
    .click();
  await expect(fs.getByText("Đã kết nối", { exact: true })).toBeVisible();

  const ai = row(page, "Trợ lý AI");
  await ai.getByRole("button", { name: "Trợ lý AI", exact: true }).click();
  await expect(ai.getByText(/Mọi kết quả AI là đề xuất có người xác nhận/)).toBeVisible();
  await ai.getByRole("tab", { name: "Cấu hình" }).click();
  for (const box of await ai
    .getByRole("group", { name: /Chức năng bật/ })
    .getByRole("checkbox")
    .all())
    await expect(box).not.toBeChecked();

  const zns = row(page, "Tin ZNS");
  await zns.getByRole("button", { name: "Tin ZNS" }).click();
  await expect(zns.getByText(/Chỉ gửi tới số Việt Nam/)).toBeVisible();

  await page
    .getByRole("navigation", { name: "Ứng dụng" })
    .getByRole("link", { name: "Cơ hội", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Lead thử TikTok/ })).toBeVisible();
});

test("ô nhiều dòng giữ đủ từng ID, chuyển tab không mất cấu hình đang nhập, Pancake không có chế độ trả lời", async ({
  page,
}) => {
  await as(page, "owner", "settings/integrations/");
  const pancake = row(page, "Pancake");
  await pancake.getByRole("button", { name: "Kết nối", exact: true }).click();
  const pages = pancake.getByRole("form", { name: /Kết nối nhanh/ }).getByLabel("ID các trang trên Pancake");
  await pages.click();
  await page.keyboard.type("page-1\npage-2");
  await expect(pages).toHaveValue("page-1\npage-2");
  await pancake.getByRole("button", { name: "Đóng" }).click();
  await pancake.getByRole("button", { name: "Pancake", exact: true }).click();
  await expect(pancake.getByText(/Pancake chỉ đưa hội thoại vào CRM để đọc/)).toBeVisible();
  await expect(pancake.getByRole("radiogroup")).toHaveCount(0);

  const smtp = row(page, "Email gửi lời mời");
  await smtp.getByRole("button", { name: "Email gửi lời mời" }).click();
  await smtp.getByRole("tab", { name: "Cấu hình" }).click();
  await smtp.getByLabel("Máy chủ SMTP").fill("smtp.example.com");
  await smtp.getByRole("tab", { name: "Điều kiện" }).click();
  await smtp.getByRole("tab", { name: "Cấu hình" }).click();
  await expect(smtp.getByLabel("Máy chủ SMTP")).toHaveValue("smtp.example.com");
});

test("ngắt Gửi chuyển đổi về Facebook giữ access token nhập tay; đấu nối lỗi hiện cảnh báo trên trang chủ", async ({
  page,
}) => {
  await as(page, "owner", "settings/integrations/");
  const capi = row(page, "Gửi chuyển đổi về Facebook");
  await capi.getByRole("button", { name: "Kết nối", exact: true }).click();
  const quick = capi.getByRole("form", { name: /Kết nối nhanh/ });
  await quick.getByLabel("Access token Conversions API").fill("x");
  await quick.getByLabel("ID Pixel hoặc tập dữ liệu").fill("880000000000001");
  // Chưa xác nhận câu xin đồng ý: kết nối báo lỗi, không gửi dữ liệu.
  await quick.getByRole("button", { name: "Kiểm tra và kết nối" }).click();
  await expect(capi.getByRole("alert")).toContainText("Chưa có Pixel");
  await capi.getByRole("button", { name: "Ngắt kết nối" }).click();
  await expect(capi.getByText(/Còn thiếu/)).toHaveCount(0);

  await capi.getByRole("button", { name: "Kết nối", exact: true }).click();
  await capi.getByRole("button", { name: "Kiểm tra và kết nối" }).click();
  await page.getByRole("navigation", { name: "Ứng dụng" }).getByRole("link", { name: "Trang chủ" }).click();
  await expect(page.getByRole("alert", { name: "Cảnh báo đấu nối" })).toContainText(
    "Gửi chuyển đổi về Facebook đang lỗi",
  );
});

test("sale admin không vào được Tích hợp", async ({ page }) => {
  await as(page, "sale_admin", "settings/integrations/");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});
