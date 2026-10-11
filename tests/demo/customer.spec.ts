import { expect, test, type Page } from "@playwright/test";

// Hồ sơ khách 360: gọi theo quyền và ghi nhật ký, nhắn kiểm đồng ý theo mục đích và kênh, rút đồng ý,
// Owner trích xuất và ẩn danh hóa theo yêu cầu xóa (CLAUDE.md mục 5, 12).

async function as(page: Page, role: "owner" | "sale_admin" | "telesale", path: string) {
  await page.goto("login/");
  await page.evaluate((r) => localStorage.setItem("dv_demo_role", r), role);
  await page.goto(path);
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Luồng dài chạy trên laptop");
});

test("khách không đồng ý tiếp thị thì không nhắn Zalo tiếp thị được", async ({ page }) => {
  await as(page, "owner", "customers/c-duc/");
  await expect(page.getByRole("button", { name: "Nhắn Zalo" })).toBeDisabled();
  await expect(page.getByText(/Zalo: Chưa có đồng ý tin khuyến mãi/)).toBeVisible();
});

test("rút đồng ý tiếp thị thì chặn nhắn ngay và ghi nhật ký", async ({ page }) => {
  await as(page, "owner", "customers/c-nam/");
  const zalo = page.getByRole("button", { name: "Nhắn Zalo" });
  await expect(zalo).toBeEnabled();
  await page.getByRole("switch", { name: "Tin khuyến mãi, làm nóng lại, Mọi kênh" }).click();
  await expect(zalo).toBeDisabled();
  await expect(page.getByRole("region", { name: "Dòng sự kiện" })).toContainText("Rút đồng ý marketing/all");
  await page.getByRole("button", { name: "Tài khoản" }).click();
  await page.getByRole("menuitem", { name: "Nhật ký kiểm toán" }).click();
  await expect(page.getByRole("cell", { name: "Đổi đồng ý" })).toBeVisible();
});

test("telesale gọi khách mình giữ thì thấy số; không có mục quyền riêng tư", async ({ page }) => {
  await as(page, "telesale", "customers/c-thu/");
  await expect(page.getByText("+82 10••••2290")).toBeVisible();
  await page.getByRole("button", { name: "Gọi", exact: true }).click();
  await expect(page.getByText("Lượt xem số được ghi lại.")).toBeVisible();
  await expect(page.getByText(/\+82 10\d{4}2290/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Dữ liệu và quyền riêng tư" })).toHaveCount(0);
});

test("Owner xử lý yêu cầu xóa: ẩn danh hóa, giữ đơn, rút mọi đồng ý", async ({ page }) => {
  await as(page, "owner", "customers/c-nam/");
  const box = page.getByRole("region", { name: "Dữ liệu và quyền riêng tư" });
  await box.getByRole("button", { name: "Xử lý yêu cầu xóa dữ liệu" }).click();
  await box.getByRole("button", { name: "Xác nhận ẩn danh hóa" }).click();
  await expect(page.getByRole("heading", { name: "Khách đã ẩn danh" })).toBeVisible();
  await expect(page.getByText("Trần Văn Nam")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Q4-2609-0010" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gọi", exact: true })).toHaveCount(0);
});
