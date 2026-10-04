import { expect, test, type Page } from "@playwright/test";

// Đội ngũ (CLAUDE.md mục 9, nghiệm thu tuần 7): chỉ tiêu, nghỉ chặn phân lead, kèm cặp ẩn với người được nhắc,
// bàn giao chuyển hết lead và việc; báo cáo lead tính từ dữ liệu.

async function as(page: Page, role: "owner" | "sale_admin" | "telesale", path: string) {
  await page.goto("login/");
  await page.evaluate((r) => localStorage.setItem("dv_demo_role", r), role);
  await page.goto(path);
}
const teamTab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Đội ngũ" }).getByRole("link", { name });

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Luồng dài chạy trên laptop");
});

test("Owner đặt chỉ tiêu; ngày nghỉ làm giảm chỉ tiêu theo ngày làm và chặn phân lead", async ({ page }) => {
  await as(page, "owner", "team/targets/");
  const input = page.getByLabel("Chỉ tiêu doanh thu Thảo");
  await input.fill("600000000");
  await input.locator("xpath=..").getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByRole("status")).toContainText("Đã đặt chỉ tiêu cho Thảo");

  await teamTab(page, "Nghỉ và trực").click();
  await page.getByLabel("Người nghỉ").selectOption({ label: "Thảo" });
  await page.getByRole("button", { name: "Duyệt nghỉ" }).click();
  await expect(page.getByRole("region", { name: "Đang trực" })).toContainText("Nghỉ hôm nay");

  await teamTab(page, "Chỉ tiêu").click();
  await expect(page.getByText(/Sau khi trừ ngày nghỉ: 576\.923\.077đ/)).toBeVisible();

  // Thảo nghỉ hôm nay: lead mới không giao cho Thảo.
  await page.getByRole("navigation", { name: "Ứng dụng" }).getByRole("link", { name: "Cơ hội" }).click();
  await page.getByRole("button", { name: "Tạo lead" }).click();
  const form = page.getByRole("form", { name: "Tạo lead" });
  await form.getByLabel("Họ tên").fill("Khách thử nghỉ");
  await form.getByLabel("Số điện thoại").fill("0909 222 333");
  await form.getByRole("button", { name: "Lưu lead" }).click();
  await expect(page.getByRole("button", { name: /Khách thử nghỉ/ })).toContainText("Chưa phân");
});

test("ghi chú kèm cặp không hiện cho người được nhắc trừ khi chia sẻ", async ({ page }) => {
  await as(page, "sale_admin", "team/coaching/");
  await page.getByLabel("Nhân viên được kèm").selectOption({ label: "Thảo" });
  await page.getByLabel("Nội dung kèm cặp").fill("Hỏi đủ 4 thông tin trước khi báo giá");
  await page.getByRole("button", { name: "Lưu ghi chú" }).click();
  await expect(page.getByText("Hỏi đủ 4 thông tin trước khi báo giá")).toBeVisible();
  // Ghi chú của Minh về Phương có sẵn; Minh thấy vì quản lý trực tiếp.
  await expect(page.getByText(/đánh thất bại 3 lead/)).toBeVisible();

  await as(page, "telesale", "team/");
  await expect(page.getByRole("region", { name: "Góp ý từ quản lý" })).toHaveCount(0);
  await page.goto("team/coaching/");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});

test("bàn giao khi nghỉ việc: khóa, lead về hàng chung, chuyển hết cho người nhận", async ({ page }) => {
  await as(page, "owner", "team/offboarding/");
  await page.getByLabel("Người nghỉ việc").selectOption({ label: "Thảo · Telesale" });
  await page.getByRole("button", { name: "Khóa Thảo" }).click();
  await expect(page.getByText("Đã khóa", { exact: true })).toBeVisible();
  const counts = page.getByText(/\d+ lead, \d+ việc, \d+ đơn chưa hoàn tất/);
  await expect(counts).not.toContainText(/^0 lead/);
  await page.getByRole("button", { name: "An", exact: true }).click();
  await page.getByRole("button", { name: "Phương", exact: true }).click();
  await page.getByRole("button", { name: "Chuyển hàng loạt" }).click();
  await expect(page.getByText("Đã bàn giao xong")).toBeVisible();
  await expect(page.getByText(/^0 lead, 0 việc/)).toBeVisible();

  await page.getByRole("navigation", { name: "Ứng dụng" }).getByRole("link", { name: "Cơ hội" }).click();
  await page.getByRole("button", { name: /Lê Hoàng Phúc/ }).click();
  await expect(page.getByRole("region", { name: "Hồ sơ lead Lê Hoàng Phúc" })).toContainText(
    /Bàn giao do nghỉ việc: Thảo → (An|Phương)/,
  );
});

test("báo cáo lead tính từ dữ liệu đang chạy", async ({ page }) => {
  await as(page, "sale_admin", "reports/");
  const r = page.getByRole("region", { name: "Báo cáo lead" });
  await expect(r).toContainText("Gọi trong SLA (5 phút)");
  await expect(r.getByRole("row", { name: /Thảo/ })).toBeVisible();
});
