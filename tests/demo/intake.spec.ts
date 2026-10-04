import { expect, test, type Page } from "@playwright/test";

// Thu lead (CLAUDE.md mục 6, 7; nghiệm thu tuần 2): chuẩn hóa số, chống trùng, phân vòng tròn cho người đang trực,
// SLA 5 phút và hàng quá hạn, hàng Chưa phân, nhập CSV có xem trước.

async function as(page: Page, role: "owner" | "sale_admin" | "telesale", path: string) {
  await page.goto("login/");
  await page.evaluate((r) => localStorage.setItem("dv_demo_role", r), role);
  await page.goto(path);
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Luồng dài chạy trên laptop");
});

async function newLead(page: Page, name: string, phone: string) {
  await page.getByRole("button", { name: "Tạo lead" }).click();
  const form = page.getByRole("form", { name: "Tạo lead" });
  await form.getByLabel("Họ tên").fill(name);
  await form.getByLabel("Số điện thoại").fill(phone);
  return form;
}

test("cùng một số không sinh hai lead mở; số khách vừa thất bại được báo người giữ cũ", async ({ page }) => {
  await as(page, "owner", "opportunities/");
  const before = await page.locator(".c-kc").count();
  const form = await newLead(page, "Thu số khác cách viết", "+82 10-5521-2290");
  await expect(form.getByRole("note")).toContainText("Trùng lead đang mở của Nguyễn Thị Thu");
  await form.getByRole("button", { name: "Lưu lead" }).click();
  await expect(page.locator(".c-kc")).toHaveCount(before);
  await expect(page.getByRole("region", { name: "Hồ sơ lead Nguyễn Thị Thu" })).toContainText(
    "trùng số, đã nối vào lead này",
  );

  const f2 = await newLead(page, "Bích", "0908 123 344");
  await expect(f2.getByRole("note")).toContainText("vừa thất bại (Giá cao)");
  await f2.getByRole("button", { name: "Lưu lead" }).click();
  await page
    .getByRole("navigation", { name: "Ứng dụng" })
    .getByRole("link", { name: "Việc cần làm" })
    .click();
  await expect(page.getByText(/Trần Thị Bích quay lại qua/)).toBeVisible();
});

test("lead mới phân vòng tròn cho người đang trực, có đồng hồ SLA; không ai trực thì chờ ở Chưa phân", async ({
  page,
}) => {
  await as(page, "telesale", "opportunities/");
  const duty = page.getByRole("switch", { name: "Đang trực" });
  await expect(duty).toHaveAttribute("aria-checked", "true");
  await duty.click();

  const form = await newLead(page, "Lê Thị Mới", "0909 111 222");
  await expect(form.getByRole("note")).toContainText("+84909111222");
  await form.getByRole("button", { name: "Lưu lead" }).click();
  // Không ai trực: lead nằm ở Chưa phân, telesale không thấy.
  await expect(page.getByRole("button", { name: /Lê Thị Mới/ })).toHaveCount(0);

  await duty.click();
  const card = page.getByRole("region", { name: "Lead mới" }).getByRole("button", { name: /Lê Thị Mới/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Còn \d+ phút|Quá SLA/);
});

test("sale admin thấy lead quá SLA và giao lại được", async ({ page }) => {
  await as(page, "sale_admin", "home/");
  const box = page.getByRole("region", { name: "Lead cần điều phối" });
  await expect(box.getByText(/Quá SLA \d+ phút/)).toBeVisible({ timeout: 20_000 });
  await box.getByLabel("Giao lead Huỳnh Thị Mai").selectOption("An");
  await expect(page.getByRole("status")).toContainText("Đã giao Huỳnh Thị Mai cho An");
});

test("nhập CSV: xem trước dòng lỗi và trùng, nhập dòng hợp lệ", async ({ page }) => {
  await as(page, "sale_admin", "opportunities/");
  await page.getByRole("button", { name: "Nhập file" }).click();
  const panel = page.getByRole("region", { name: "Nhập file lead" });
  await panel.getByRole("button", { name: "Dùng dữ liệu thử" }).click();
  await expect(panel).toContainText("4 dòng: 2 hợp lệ, 1 lỗi, 0 trùng trong tệp, 1 đã có trong CRM.");
  await expect(panel.getByRole("row", { name: /Lê Văn C/ })).toContainText("Số điện thoại không hợp lệ");
  await panel.getByRole("button", { name: "Nhập 2 lead" }).click();
  await expect(page.getByRole("button", { name: /Nguyễn Văn A/ })).toBeVisible();
  await page.getByRole("button", { name: /Nguyễn Văn A/ }).click();
  await expect(page.getByRole("region", { name: "Hồ sơ lead Nguyễn Văn A" })).toContainText(
    "Nhập từ dữ liệu cũ",
  );
});

test("telesale không có nút nhập file", async ({ page }) => {
  await as(page, "telesale", "opportunities/");
  await expect(page.getByRole("button", { name: "Tạo lead" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nhập file" })).toHaveCount(0);
});
