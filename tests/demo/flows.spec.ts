import { expect, test, type Page } from "@playwright/test";

// Luồng chính của bản demo theo bản mẫu: hội thoại, cơ hội, hộ gia đình, duyệt, agent, phân quyền theo vai trò.

async function as(page: Page, role: "owner" | "sale_admin" | "telesale", path: string) {
  await page.goto("login/");
  await page.evaluate((r) => localStorage.setItem("dv_demo_role", r), role);
  await page.goto(path);
}

test("trả lời khách Zalo thì khách đồng ý video call và cơ hội sang Demo", async ({ page }) => {
  await as(page, "owner", "inbox/");
  await page.getByRole("button", { name: "Tiếp quản" }).click();
  await expect(page.locator(".c-sys").getByText("Nhân viên đã tiếp quản từ agent")).toBeVisible();
  await page.locator(".c-sr").first().click();
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.locator(".c-bb").getByText("Ok em, 21h tối nay chị gọi nha")).toBeVisible({
    timeout: 6000,
  });

  // Điều hướng trong ứng dụng giữ trạng thái mô phỏng.
  await page.getByRole("link", { name: "Cơ hội", exact: true }).click();
  const demo = page.getByRole("region", { name: "Demo, video call" });
  await expect(demo.getByRole("button", { name: /Nguyễn Thị Thu/ })).toBeVisible();
  await demo.getByRole("button", { name: /Nguyễn Thị Thu/ }).click();
  await page.getByRole("button", { name: "Gửi báo giá" }).click();
  await expect(
    page.getByRole("region", { name: "Báo giá" }).getByRole("button", { name: /Nguyễn Thị Thu/ }),
  ).toBeVisible();
});

test("tìm kiếm mở hộ gia đình và tạo cơ hội bán chéo", async ({ page }) => {
  await as(page, "owner", "home/");
  const search = page.getByLabel("Tìm kiếm");
  test.skip(!(await search.isVisible()), "Ô tìm kiếm ẩn trên màn hình hẹp");
  await search.fill("Phuc");
  await search.press("Enter");
  await expect(page).toHaveURL(/households/);
  await expect(page.getByRole("heading", { name: "Hộ Lê" })).toBeVisible();
  await page.getByRole("button", { name: "Tạo cơ hội, giao Thảo" }).click();
  await expect(page.getByText("Đã tạo cơ hội", { exact: true })).toBeVisible();
});

test("Owner duyệt đề xuất của agent, tắt một agent", async ({ page }) => {
  await as(page, "owner", "agents/");
  const sw = page.getByRole("switch", { name: "Agent Phân lead" });
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: /Chờ duyệt:/ }).click();
  const pop = page.getByRole("dialog", { name: "Chờ duyệt" });
  const items = pop.locator(".c-appr");
  const n = await items.count();
  test.skip(n === 0, "Chưa có đề xuất chờ duyệt");
  await pop.getByRole("button", { name: "Duyệt" }).first().click();
  await expect(items).toHaveCount(n - 1);
});

test("trợ lý AI trả lời câu hỏi gợi ý theo màn hình", async ({ page }) => {
  await as(page, "owner", "reports/");
  await page.getByRole("button", { name: "Hỏi AI" }).click();
  await expect(page.getByRole("complementary", { name: "Trợ lý AI" })).toContainText("78% doanh thu");
});

test("telesale chỉ thấy việc của mình, không vào được Agent", async ({ page }) => {
  await as(page, "telesale", "opportunities/");
  await expect(page.getByRole("heading", { name: "Cơ hội" })).toBeVisible();
  await expect(page.getByText("Phạm Minh Đức")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Agent", exact: true })).toHaveCount(0);
  await page.goto("agents/");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
  await page.goto("households/");
  await expect(page.getByRole("button", { name: /Hộ Phạm/ })).toHaveCount(0);
});

for (const path of ["home/", "opportunities/", "households/", "deliveries/", "inbox/", "reports/"]) {
  test(`không tràn ngang: ${path}`, async ({ page }) => {
    await as(page, "sale_admin", path);
    await expect(page.locator(".c-main")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
}
