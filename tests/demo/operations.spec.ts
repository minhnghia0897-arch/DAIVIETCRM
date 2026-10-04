import { expect, test, type Page } from "@playwright/test";

// Luồng vận hành theo CLAUDE.md: hồ sơ lead và 4 thông tin bắt buộc, ghi cuộc gọi, hẹn gọi lại, giữ bất ngờ,
// báo giá qua hàm định giá, duyệt giảm giá, đơn, thanh toán tách người, giao lắp, việc hậu bán, cài đặt, kiểm toán.
// Trạng thái mô phỏng sống trong trình duyệt nên chuyển trang bằng thanh tab (không tải lại trang).

test.describe.configure({ mode: "parallel" });

async function as(page: Page, role: "owner" | "sale_admin" | "telesale", path: string) {
  await page.goto("login/");
  await page.evaluate((r) => localStorage.setItem("dv_demo_role", r), role);
  await page.goto(path);
}

const tab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Ứng dụng" }).getByRole("link", { name, exact: true });

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "laptop",
    "Luồng dài chạy trên laptop; điện thoại đã có bài không tràn ngang",
  );
});

test("telesale: gọi, ghi kết quả, đủ 4 thông tin mới sang Demo, giảm 7% phải chờ duyệt", async ({ page }) => {
  await as(page, "telesale", "opportunities/");
  await page.getByRole("button", { name: /Huỳnh Thị Mai/ }).click();
  const profile = page.getByRole("region", { name: "Hồ sơ lead Huỳnh Thị Mai" });
  await expect(profile.getByRole("note")).toContainText("Thiếu thông tin bắt buộc");

  // Gọi ngoài hệ thống: hiện số đầy đủ của đúng lead được giao, mở bảng ghi kết quả.
  await profile.getByRole("button", { name: "Gọi Mai" }).click();
  await expect(profile.getByText("+82 10 6612 0937")).toBeVisible();
  await profile.getByRole("radio", { name: "Nghe máy, quan tâm" }).click();
  await profile
    .getByRole("button", { name: /giờ Hàn/ })
    .first()
    .click();
  await profile.getByRole("button", { name: "Lưu kết quả" }).click();
  await expect(
    page.getByRole("region", { name: "Đã liên hệ" }).getByRole("button", { name: /Huỳnh Thị Mai/ }),
  ).toBeVisible();

  const demo = profile.getByRole("button", { name: "Chuyển sang Demo, video call" });
  await expect(demo).toBeDisabled();
  await expect(profile.getByRole("button", { name: "Tạo báo giá" })).toBeDisabled();
  await profile.getByLabel("Tặng người khác").check();
  await profile.getByLabel("Quan hệ người nhận").selectOption("Mẹ");
  await profile.getByLabel("Tỉnh người nhận").selectOption("Thanh Hóa");
  await profile.getByLabel("Dịp mua").selectOption("Tết");
  await profile.getByLabel("Ngân sách").selectOption("30–50tr");
  await expect(demo).toBeEnabled();
  await demo.click();
  await expect(
    page.getByRole("region", { name: "Demo, video call" }).getByRole("button", { name: /Huỳnh Thị Mai/ }),
  ).toBeVisible();

  await profile.getByRole("button", { name: "Tạo báo giá" }).click();
  await profile.getByLabel("Giảm tay dòng 1").fill("7");
  await expect(profile.getByText("Cần Owner duyệt: Giảm tay 7,0% vượt giới hạn 5%")).toBeVisible();
  await profile.getByRole("button", { name: "Gửi duyệt giảm giá" }).click();
  await expect(profile.getByText("Chờ duyệt giảm giá")).toBeVisible();
  // Chưa duyệt thì cơ hội chưa sang Báo giá.
  await expect(
    page.getByRole("region", { name: "Báo giá" }).getByRole("button", { name: /Huỳnh Thị Mai/ }),
  ).toHaveCount(0);

  await tab(page, "Việc cần làm").click();
  await expect(page.getByRole("heading", { name: "Tôi đang chờ người khác duyệt" })).toBeVisible();
  await expect(page.getByText("Gọi lại Huỳnh Thị Mai")).toBeVisible();
});

test("telesale không xem được số của lead người khác; giữ bất ngờ ẩn số người nhận", async ({ page }) => {
  await as(page, "owner", "opportunities/");
  await page.getByRole("button", { name: /Phạm Minh Đức/ }).click();
  const p = page.getByRole("region", { name: "Hồ sơ lead Phạm Minh Đức" });
  await expect(p.getByText("091•••630")).toBeVisible();
  await p.getByRole("switch", { name: "Giữ bất ngờ" }).click();
  await expect(p.getByText("Ẩn vì Giữ bất ngờ")).toBeVisible();
  await expect(p.getByText("091•••630")).toHaveCount(0);

  await as(page, "telesale", "opportunities/");
  await expect(page.getByRole("button", { name: /Phạm Minh Đức/ })).toHaveCount(0);
});

test("Owner: báo giá → khách đồng ý → đơn → cọc → xác nhận → giao → hoàn tất sinh việc hậu bán", async ({
  page,
}) => {
  await as(page, "owner", "opportunities/");
  await page.getByRole("button", { name: /Nguyễn Thị Thu/ }).click();
  const p = page.getByRole("region", { name: "Hồ sơ lead Nguyễn Thị Thu" });
  await p.getByRole("button", { name: "Tạo báo giá" }).click();
  await p.getByRole("button", { name: "Gửi báo giá", exact: true }).click();
  await expect(p.getByText("Đã gửi", { exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Xem trang khách" }).click();
  await expect(p.getByLabel("Trang báo giá cho khách")).toContainText("Chuyển khoản vào tài khoản công ty");
  await expect(p.getByLabel("Trang báo giá cho khách")).not.toContainText("+82 10 5521");
  await p.getByRole("button", { name: "Khách đã đồng ý" }).click();

  await tab(page, "Đơn & giao lắp").click();
  const order = page.getByRole("region", { name: "Đơn DV-1028" });
  await expect(order).toContainText("Chưa thanh toán");
  await order.getByRole("button", { name: "Ghi nhận thanh toán" }).click();
  await order.getByRole("button", { name: "Ghi nhận", exact: true }).click();
  await expect(order.getByText("Chờ xác nhận", { exact: true })).toBeVisible();

  // Owner được tự xác nhận khoản mình ghi, có ghi nhận riêng.
  await page.getByRole("button", { name: /Chờ duyệt:/ }).click();
  const queue = page.getByRole("dialog", { name: "Chờ duyệt" });
  const item = queue.locator(".c-appr").filter({ hasText: "DV-1028" });
  await expect(item).toContainText("lần duyệt này được ghi riêng");
  await item.getByRole("button", { name: "Duyệt" }).click();
  await queue.getByRole("button", { name: "Đóng" }).click();
  await expect(order.getByText("Đã xác nhận", { exact: true })).toBeVisible();

  await order.getByRole("button", { name: /xác nhận người nhận|Xác nhận người nhận/ }).click();
  const ship = order.getByRole("button", { name: "Ghi sổ xuất kho, gán serial" });
  await expect(ship).toBeDisabled();
  await order.getByRole("button", { name: "Ghi nhận thanh toán" }).click();
  await order.getByRole("button", { name: "Ghi nhận", exact: true }).click();
  await page.getByRole("button", { name: /Chờ duyệt:/ }).click();
  await queue
    .locator(".c-appr")
    .filter({ hasText: "DV-1028" })
    .getByRole("button", { name: "Duyệt" })
    .click();
  await queue.getByRole("button", { name: "Đóng" }).click();
  await expect(ship).toBeEnabled();
  await ship.click();
  await order.getByRole("button", { name: "Xác nhận đã giao và lắp" }).click();
  await order.getByRole("button", { name: "Gửi video bàn giao" }).click();
  await order.getByRole("button", { name: "Ghi nhận đánh giá, hoàn tất" }).click();
  await expect(order.getByText("Hoàn tất, đã sinh bảo hành")).toBeVisible();

  await tab(page, "Cơ hội").click();
  await expect(
    page.getByRole("region", { name: "Giao & lắp" }).getByRole("button", { name: /Nguyễn Thị Thu/ }),
  ).toBeVisible();
  await tab(page, "Việc cần làm").click();
  await expect(page.getByText("Gọi hỏi thăm Nguyễn Thị Thu sau 3 ngày")).toBeVisible();

  // Nhật ký kiểm toán có lần tự duyệt của Owner.
  await page.getByRole("button", { name: "Tài khoản" }).click();
  await page.getByRole("menuitem", { name: "Nhật ký kiểm toán" }).click();
  await expect(page.getByRole("cell", { name: "Tự duyệt (Owner)" }).first()).toBeVisible();
});

test("sale admin không tự xác nhận khoản mình ghi nhận", async ({ page }) => {
  await as(page, "sale_admin", "opportunities/");
  await page.getByRole("button", { name: /Lương Văn Tài/ }).click();
  const p = page.getByRole("region", { name: "Hồ sơ lead Lương Văn Tài" });
  await p.getByRole("button", { name: "Tạo báo giá" }).click();
  await p.getByRole("button", { name: "Gửi báo giá", exact: true }).click();
  await p.getByRole("button", { name: "Khách đã đồng ý" }).click();
  await tab(page, "Đơn & giao lắp").click();
  const order = page.getByRole("region", { name: "Đơn DV-1028" });
  await order.getByRole("button", { name: "Ghi nhận thanh toán" }).click();
  await order.getByRole("button", { name: "Ghi nhận", exact: true }).click();
  await page.getByRole("button", { name: /Chờ duyệt:/ }).click();
  const item = page
    .getByRole("dialog", { name: "Chờ duyệt" })
    .locator(".c-appr")
    .filter({ hasText: "DV-1028" });
  await expect(item).toContainText("Bạn là người đề xuất, cần người khác duyệt");
  await expect(item.getByRole("button", { name: "Duyệt" })).toHaveCount(0);
});

test("Thử chính sách: giảm vượt mức cần duyệt, hết hạn đúng ngày", async ({ page }) => {
  await as(page, "owner", "policies/");
  const tester = page.getByRole("region", { name: "Thử chính sách" });
  const t = tester.getByRole("group", { name: "Kết quả định giá" });
  await expect(t).toContainText("Gối massage cổ");
  await tester.getByLabel("Giảm tay thử").fill("7");
  await expect(t).toContainText("Cần Owner duyệt");
  await tester.getByLabel("Ngày thử").fill("2026-10-14");
  await expect(t).not.toContainText("Gối massage cổ");
  await expect(t).toContainText("Người đặt ở Hàn giảm 1 triệu");

  // Sửa chính sách đang áp tạo phiên bản mới.
  const row = page.getByRole("row", { name: /Khách được giới thiệu giảm 3%/ });
  await row.getByRole("button", { name: "Sửa" }).click();
  await row.getByLabel("Giảm phần trăm").fill("4");
  await row.getByRole("button", { name: "Lưu" }).click();
  await expect(row).toContainText("v2");
});

test("Cài đặt: kênh trả lời ở công cụ khác thì hộp thư chỉ đọc; chế độ tổng đài không hiện số", async ({
  page,
}) => {
  await as(page, "owner", "settings/integrations/");
  await page
    .getByRole("button", { name: /Zalo OA/ })
    .first()
    .click();
  await page
    .getByRole("radiogroup", { name: "Chế độ trả lời Zalo OA" })
    .getByLabel("Trả lời ở công cụ khác, CRM chỉ đọc")
    .check();
  await tab(page, "Hội thoại").click();
  await expect(page.getByText("Kênh này đang được trả lời trên Pancake, CRM chỉ đọc.")).toBeVisible();
  await expect(page.getByLabel("Nội dung trả lời")).toHaveCount(0);

  await page.getByRole("button", { name: "Tài khoản" }).click();
  await page.getByRole("menuitem", { name: "Chế độ gọi" }).click();
  await page.getByLabel(/Qua tổng đài/).check();
  await expect(page.getByText("Nhắc: vào Phân quyền tắt quyền")).toBeVisible();
  await tab(page, "Cơ hội").click();
  await page.getByRole("button", { name: /Huỳnh Thị Mai/ }).click();
  const p = page.getByRole("region", { name: "Hồ sơ lead Huỳnh Thị Mai" });
  await p.getByRole("button", { name: "Gọi Mai" }).click();
  await expect(p.getByText("+82 10 6612 0937")).toHaveCount(0);
  await expect(p.getByLabel("Ghi kết quả cuộc gọi")).toContainText("Tổng đài");
});

test("telesale chỉ xem chính sách, không sửa, không vào Tích hợp", async ({ page }) => {
  await as(page, "telesale", "policies/");
  await expect(page.getByRole("heading", { name: "Chính sách", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sửa" })).toHaveCount(0);
  await page.goto("settings/integrations/");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});
