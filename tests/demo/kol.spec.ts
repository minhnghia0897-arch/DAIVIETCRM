import { expect, test, type Page } from "@playwright/test";

// KOL, KOC (bản demo, lib/koc): danh sách và lọc, hồ sơ, booking đi trọn từ đề xuất tới thanh toán, booking vượt
// hạn mức chờ Owner duyệt, thêm người mới, quyền theo vai trò.

async function as(page: Page, role: "owner" | "sale_admin" | "telesale", path: string) {
  await page.goto("login/");
  await page.evaluate((r) => localStorage.setItem("dv_demo_role", r), role);
  await page.goto(path);
}
const toast = (page: Page) => page.getByRole("status").last();

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Luồng dài chạy trên laptop");
});

test("danh sách lọc theo khán giả, hồ sơ có lead theo mã và tiền còn phải trả", async ({ page }) => {
  await as(page, "owner", "home/");
  await page.getByRole("navigation", { name: "Ứng dụng" }).getByRole("link", { name: "KOL, KOC" }).click();
  const list = page.getByRole("region", { name: "Danh sách KOL, KOC" });
  await expect(list.getByRole("link", { name: "Vợ chồng Ansan" })).toBeVisible();

  await page.getByLabel("Khán giả").selectOption({ label: "Trong nước" });
  await expect(list.getByRole("link", { name: "Vợ chồng Ansan" })).toHaveCount(0);
  await expect(list.getByRole("link", { name: "Mẹ Hiền Review" })).toBeVisible();
  await page.getByLabel("Khán giả").selectOption({ label: "Mọi khán giả" });

  await list.getByRole("link", { name: "Vợ chồng Ansan" }).click();
  await expect(page.getByRole("heading", { name: "Vợ chồng Ansan" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Lead và đơn có mã giới thiệu" })).toContainText("9 lead");
  // Phí 6tr đã trả, còn hoa hồng 3% trên 3 đơn hoàn tất.
  await expect(page.getByRole("region", { name: "Thanh toán cho KOL, KOC" })).toContainText("6.291.000đ");
  // Số điện thoại che, Owner bấm Hiện số mới thấy.
  const contact = page.getByRole("region", { name: "Liên hệ" });
  await expect(contact).toContainText("+82 10••••7731");
  await contact.getByRole("button", { name: "Hiện số" }).click();
  await expect(contact).toContainText("+821055517731");
});

test("booking đi trọn từ đề xuất tới thanh toán", async ({ page }) => {
  await as(page, "owner", "kol/bookings/");
  await page.getByRole("button", { name: "Đặt booking" }).click();
  const form = page.getByRole("form", { name: "Đặt booking" });
  await form.getByLabel("KOL, KOC").selectOption({ label: "Bảo Trâm sống khỏe" });
  await form.getByLabel("Chiến dịch").fill("Thử luồng booking");
  await form.getByLabel("Chi phí (triệu)").fill("2");
  await form.getByRole("button", { name: "Gối massage cổ" }).click();
  await expect(form).toContainText("chốt được ngay");
  await form.getByRole("button", { name: "Đề xuất booking" }).click();
  await expect(toast(page)).toContainText("Đã đề xuất booking Thử luồng booking");

  await page.getByRole("button", { name: "Mở booking Thử luồng booking" }).click();
  const panel = page.getByRole("region", { name: "Chi tiết booking Thử luồng booking" });
  await panel.getByRole("button", { name: "Chốt booking" }).click();
  await expect(panel.getByRole("listitem").filter({ hasText: "Đã chốt" })).toHaveAttribute(
    "aria-current",
    "step",
  );

  // Chưa ghi hàng mẫu thì không sang bước gửi mẫu.
  await expect(panel.getByRole("button", { name: "Ghi đã gửi hàng mẫu" })).toHaveCount(0);
  await expect(panel).toContainText("Chưa ghi hàng mẫu đã gửi");
  await panel.getByLabel("Số serial (nếu có)").fill("GC-0001");
  await panel.getByRole("button", { name: "Ghi gửi hàng mẫu" }).click();
  await panel.getByRole("button", { name: "Ghi đã gửi hàng mẫu" }).click();
  await panel.getByRole("button", { name: "Duyệt kịch bản" }).click();

  // Dán link bài kèm lượt xem rồi ghi đã đăng, nghiệm thu.
  await panel.getByLabel("Link bài").fill("https://www.tiktok.com/@baotramsongkhoe/video/1");
  await panel.getByLabel("Lượt xem").fill("12000");
  await panel.getByRole("button", { name: "Lưu bài đã đăng" }).click();
  await panel.getByRole("button", { name: "Ghi bài đã đăng" }).click();
  await panel.getByRole("button", { name: "Nghiệm thu" }).click();

  // Chưa trả đủ phí thì chưa ghi đã thanh toán.
  await expect(panel).toContainText("Mới ghi trả 0đ");
  await panel.getByLabel("Mã giao dịch, nội dung chuyển khoản").fill("CK THU BOOKING");
  await panel.getByRole("button", { name: "Ghi tiền đã trả" }).click();
  await expect(toast(page)).toContainText("Đã ghi trả 2.000.000đ");
  await panel.getByRole("button", { name: "Ghi đã thanh toán" }).click();
  await expect(toast(page)).toContainText("Thử luồng booking: Đã thanh toán");
  // Booking đã xong rời bộ lọc Đang chạy, nằm ở Đã xong.
  // Dòng đang mở vẫn mở khi đổi bộ lọc.
  await page.getByRole("button", { name: "Đã xong, đã hủy" }).click();
  await expect(panel.getByRole("listitem").filter({ hasText: "Đã thanh toán" })).toHaveAttribute(
    "aria-current",
    "step",
  );
});

test("booking vượt hạn mức chờ Owner duyệt ngân sách", async ({ page }) => {
  await as(page, "sale_admin", "kol/bookings/");
  await page.getByRole("button", { name: "Mở booking Ra mắt DV-X9 cho người Việt tại Hàn" }).click();
  const panel = page.getByRole("region", { name: "Chi tiết booking Ra mắt DV-X9 cho người Việt tại Hàn" });
  await expect(panel).toContainText("Đang chờ Owner duyệt ngân sách.");
  await expect(panel.getByRole("button", { name: "Duyệt ngân sách và chốt" })).toHaveCount(0);

  await as(page, "owner", "kol/bookings/");
  await page.getByRole("button", { name: "Mở booking Ra mắt DV-X9 cho người Việt tại Hàn" }).click();
  const ownerPanel = page.getByRole("region", {
    name: "Chi tiết booking Ra mắt DV-X9 cho người Việt tại Hàn",
  });
  await ownerPanel.getByRole("button", { name: "Duyệt ngân sách và chốt" }).click();
  await expect(toast(page)).toContainText("Đã chốt");
  await expect(ownerPanel).toContainText("Hà Owner");
});

test("thêm KOC mới rồi mở hồ sơ; không đặt booking cho người đang tạm dừng", async ({ page }) => {
  await as(page, "sale_admin", "kol/");
  await page.getByRole("button", { name: "Thêm KOL, KOC" }).click();
  const form = page.getByRole("form", { name: "Thêm KOL, KOC" });
  await form.getByLabel("Tên hiển thị").fill("Hồng Incheon");
  await form.getByLabel("Khán giả chính").selectOption({ label: "Người Việt tại Hàn" });
  await form.getByLabel("Tài khoản").fill("@hongincheon");
  await form.getByLabel("Người theo dõi").fill("15000");
  await expect(form.getByLabel("Mã giới thiệu")).toHaveValue("HONGINCH");
  await form.getByRole("button", { name: "Lưu KOL, KOC" }).click();
  await expect(page.getByRole("heading", { name: "Hồng Incheon" })).toBeVisible();
  await expect(page.getByText("Micro (10–50 nghìn)")).toBeVisible();

  await page.goto("kol/koc-lam/");
  await expect(page.getByRole("heading", { name: "Lâm Đi Làm Ở Hàn" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đặt booking" })).toHaveCount(0);
});

test("tải tệp hợp đồng lên hồ sơ, gỡ tệp; tạo hợp đồng cho người chưa có", async ({ page }) => {
  await as(page, "sale_admin", "kol/koc-hanh/");
  const files = page.getByRole("group", { name: "Tệp hợp đồng" });
  await expect(files).toContainText("hop-dong-chi-hanh.pdf");
  await files.getByLabel("Loại tệp").selectOption({ label: "Phụ lục" });
  await files.getByLabel("Chọn tệp hợp đồng").setInputFiles({
    name: "phu-luc-chi-hanh.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 phu luc"),
  });
  await expect(page.getByRole("status").last()).toContainText("Đã tải lên phu-luc-chi-hanh.pdf");
  await expect(files.getByRole("link", { name: "phu-luc-chi-hanh.pdf", exact: true })).toBeVisible();
  await expect(files).toContainText("Phụ lục, PDF");

  // Tệp không đúng loại bị chặn.
  await files.getByLabel("Chọn tệp hợp đồng").setInputFiles({
    name: "anh.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("GIF89a"),
  });
  await expect(page.getByRole("status").last()).toContainText("Chỉ nhận tệp PDF");

  await files.getByRole("button", { name: "Gỡ phu-luc-chi-hanh.pdf" }).click();
  await files.getByRole("button", { name: "Gỡ tệp" }).click();
  await expect(files.getByRole("link", { name: "phu-luc-chi-hanh.pdf", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Dòng hoạt động" })).toContainText(
    "Gỡ tệp hợp đồng phu-luc-chi-hanh.pdf",
  );

  // Người chưa có hợp đồng: tạo hợp đồng rồi mới tải tệp.
  await page.goto("kol/kol-seoul/");
  await page.getByRole("button", { name: "Tạo hợp đồng" }).click();
  const form = page.getByRole("form", { name: "Tạo hợp đồng" });
  await form.getByLabel("Số hợp đồng").fill("HĐ-KOL-2610-01");
  await form.getByRole("button", { name: "Lưu hợp đồng" }).click();
  await expect(page.getByRole("status").last()).toContainText("Đã tạo hợp đồng");
  await page
    .getByRole("group", { name: "Tệp hợp đồng" })
    .getByLabel("Chọn tệp hợp đồng")
    .setInputFiles({
      name: "hop-dong-seoul.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });
  await expect(page.getByRole("link", { name: "hop-dong-seoul.pdf", exact: true })).toBeVisible();
});

test("telesale không thấy menu KOL, KOC", async ({ page }) => {
  await as(page, "telesale", "home/");
  await expect(
    page.getByRole("navigation", { name: "Ứng dụng" }).getByRole("link", { name: "KOL, KOC" }),
  ).toHaveCount(0);
  await page.goto("kol/");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});
