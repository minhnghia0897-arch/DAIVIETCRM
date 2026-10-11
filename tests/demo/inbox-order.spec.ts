import { expect, test, type Page } from "@playwright/test";

// Lên đơn và ghi chú ngay trong hội thoại (kiểu Pancake): đọc tin của khách để điền sẵn, nhân viên kiểm lại rồi tạo.

async function as(page: Page, role: "owner" | "sale_admin" | "telesale", path: string) {
  await page.goto("login/");
  await page.evaluate((r) => localStorage.setItem("dv_demo_role", r), role);
  await page.goto(path);
}

test("lên đơn từ hội thoại với địa chỉ, sản phẩm khách đã nhắn", async ({ page }) => {
  await as(page, "owner", "inbox/");
  await page
    .getByLabel("Danh sách hội thoại")
    .getByRole("button", { name: /Nguyễn Thị Thu/ })
    .click();
  const side = page.getByRole("complementary", { name: "Trợ lý hội thoại" });
  const told = side.getByRole("list", { name: "Khách đã cho biết" });
  await expect(told).toContainText("xóm 5, xã Diễn Thành, Diễn Châu, Nghệ An");
  await expect(told).toContainText("Ghế massage DV-X9");
  await expect(told).toContainText("Tết");

  await side.getByRole("tab", { name: "Lên đơn" }).click();
  const form = side.getByRole("form", { name: "Tạo đơn" });
  await expect(form.getByLabel("Tỉnh giao")).toHaveValue("Nghệ An");
  await expect(form.getByLabel("Quận, huyện")).toHaveValue("Diễn Châu");
  await expect(form.getByLabel("Họ tên người đặt")).toHaveValue("Nguyễn Thị Thu");
  await form.getByRole("button", { name: /^Tạo đơn/ }).click();

  await expect(side.getByRole("status")).toContainText(/Đã lên đơn Q4-/);
  await expect(
    page.getByRole("log", { name: "Tin nhắn" }).getByText(/đã lên đơn Q4-.* từ hội thoại/),
  ).toBeVisible();
});

test("ghim ghi chú về khách lên đầu hội thoại", async ({ page }) => {
  await as(page, "owner", "inbox/");
  await page
    .getByLabel("Danh sách hội thoại")
    .getByRole("button", { name: /Nguyễn Thị Thu/ })
    .click();
  const side = page.getByRole("complementary", { name: "Trợ lý hội thoại" });
  await side.getByRole("tab", { name: /^Ghi chú/ }).click();
  await side.getByLabel("Ghi chú về khách").fill("Chỉ gọi sau 21h giờ Hàn, thích màu nâu");
  await side.getByRole("button", { name: "Ghim ghi chú" }).click();
  await expect(page.getByRole("list", { name: "Ghi chú đã ghim" })).toContainText("thích màu nâu");
  await side.getByRole("button", { name: "Lưu tóm tắt hội thoại" }).click();
  await expect(side.getByRole("list", { name: "Ghi chú đã lưu" }).getByRole("listitem")).toHaveCount(2);
});

test("giao hội thoại cho nhân viên, gắn thẻ, lọc khách theo thẻ và người phụ trách", async ({
  page,
}, testInfo) => {
  // Điện thoại: danh sách và khung chat là hai màn, kiểm cùng lúc cả hai chỉ làm được ở màn rộng.
  test.skip(testInfo.project.name !== "laptop", "Danh sách và khung chat cùng hiện ở màn rộng");
  await as(page, "owner", "inbox/");
  const list = page.getByLabel("Danh sách hội thoại");
  await list.getByRole("button", { name: /Nguyễn Thị Thu/ }).click();

  // Giao cho My: dòng hội thoại hiện thẻ người phụ trách, khung chat ghi lại.
  await page.getByLabel("Nhân viên phụ trách").selectOption("My");
  await expect(list.getByRole("button", { name: /Nguyễn Thị Thu/ })).toContainText("My");
  await expect(page.getByRole("log", { name: "Tin nhắn" })).toContainText("giao hội thoại cho My");

  // Tạo thẻ mới rồi lọc theo thẻ đó.
  const side = page.getByRole("complementary", { name: "Trợ lý hội thoại" });
  await side.getByLabel("Tạo thẻ mới").fill("Hẹn video call");
  await side.getByRole("button", { name: "Thêm thẻ" }).click();
  await expect(side.getByRole("button", { name: "Hẹn video call" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Lọc theo thẻ").selectOption("Hẹn video call");
  await expect(list.getByRole("button")).toHaveCount(1);

  // Bỏ thẻ thì không còn khớp bộ lọc.
  await side.getByRole("button", { name: "Hẹn video call" }).click();
  await expect(page.getByText("Không có khách nào khớp bộ lọc.")).toBeVisible();
  await page.getByLabel("Lọc theo thẻ").selectOption("");

  // Lọc theo nhân viên và "Chưa giao".
  await page.getByLabel("Lọc theo nhân viên").selectOption("My");
  await expect(list.getByRole("button", { name: /Nguyễn Thị Thu/ })).toBeVisible();
  await expect(list.getByRole("button", { name: /Lê Hoàng Phúc/ })).toHaveCount(0);
  await page.getByLabel("Lọc theo nhân viên").selectOption("");
  await page
    .getByRole("group", { name: "Lọc khách" })
    .getByRole("button", { name: /Chưa giao/ })
    .click();
  await expect(list.getByRole("button", { name: /phuong\.kr92/ })).toBeVisible();
  await expect(list.getByRole("button", { name: /Nguyễn Thị Thu/ })).toHaveCount(0);
});

test("telesale không giao hội thoại cho người khác, chỉ thấy người phụ trách", async ({ page }) => {
  await as(page, "telesale", "inbox/");
  await page
    .getByLabel("Danh sách hội thoại")
    .getByRole("button", { name: /Nguyễn Thị Thu/ })
    .click();
  await expect(page.getByLabel("Nhân viên phụ trách")).toHaveCount(0);
  await expect(page.getByText("Thảo phụ trách")).toBeVisible();
});
