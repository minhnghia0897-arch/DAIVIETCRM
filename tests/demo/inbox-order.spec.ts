import { expect, test, type Page } from "@playwright/test";

// Lên đơn và ghi chú ngay trong hội thoại (kiểu Pancake): đọc tin của khách để điền sẵn, nhân viên kiểm lại rồi tạo.

async function as(page: Page, role: "owner" | "sale_admin" | "telesale", path: string) {
  await page.goto("login/");
  await page.evaluate((r) => localStorage.setItem("dv_demo_role", r), role);
  await page.goto(path);
}

test("lên đơn từ hội thoại với địa chỉ, sản phẩm khách đã nhắn", async ({ page }) => {
  await as(page, "owner", "inbox/");
  const side = page.getByRole("complementary", { name: "Trợ lý hội thoại" });
  const told = side.getByRole("list", { name: "Khách đã cho biết" });
  await expect(told).toContainText("xóm 5, xã Diễn Thành, Diễn Châu, Nghệ An");
  await expect(told).toContainText("Ghế massage DV-X9");
  await expect(told).toContainText("Tết");

  await side.getByRole("button", { name: "Lên đơn", exact: true }).click();
  const form = side.getByRole("form", { name: "Tạo đơn" });
  await expect(form.getByLabel("Tỉnh giao")).toHaveValue("Nghệ An");
  await expect(form.getByLabel("Quận, huyện")).toHaveValue("Diễn Châu");
  await expect(form.getByLabel("Họ tên người đặt")).toHaveValue("Nguyễn Thị Thu");
  await form.getByRole("button", { name: /^Tạo đơn/ }).click();

  await expect(side.getByRole("status")).toContainText(/Đã lên đơn Q4-/);
  await expect(page.locator(".c-sys").getByText(/đã lên đơn Q4-.* từ hội thoại/)).toBeVisible();
});

test("ghim ghi chú về khách lên đầu hội thoại", async ({ page }) => {
  await as(page, "owner", "inbox/");
  const side = page.getByRole("complementary", { name: "Trợ lý hội thoại" });
  await side.getByRole("button", { name: "Ghi chú", exact: true }).click();
  await side.getByLabel("Ghi chú về khách").fill("Chỉ gọi sau 21h giờ Hàn, thích màu nâu");
  await side.getByRole("button", { name: "Ghim ghi chú" }).click();
  await expect(page.getByRole("list", { name: "Ghi chú đã ghim" })).toContainText("thích màu nâu");
  await side.getByRole("button", { name: "Lưu tóm tắt hội thoại" }).click();
  await expect(side.getByRole("list", { name: "Ghi chú đã lưu" }).getByRole("listitem")).toHaveCount(2);
});
