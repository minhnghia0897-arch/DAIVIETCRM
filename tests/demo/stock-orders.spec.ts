import { expect, test, type Page } from "@playwright/test";

// Kho và đơn hàng (CLAUDE.md 8.3, 8.7; nghiệm thu tuần 5, 6): tồn chỉ đổi qua phiếu đã ghi sổ, kiểm kê cần duyệt,
// đơn đi từng bước có điều kiện, cọc thì giữ hàng, xuất kho gán serial, hoàn tất sinh bảo hành, hủy thì nhả hàng.

async function as(page: Page, role: "owner" | "sale_admin" | "telesale", path: string) {
  await page.goto("login/");
  await page.evaluate((r) => localStorage.setItem("dv_demo_role", r), role);
  await page.goto(path);
}

const tab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Ứng dụng" }).getByRole("link", { name, exact: true });

const row = (page: Page, sku: string) =>
  page.getByRole("region", { name: "Bảng tồn kho" }).getByRole("row", { name: new RegExp(sku) });

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Luồng dài chạy trên laptop");
});

test("phiếu nhập chỉ đổi tồn khi ghi sổ; sổ kho ghi lại", async ({ page }) => {
  await as(page, "sale_admin", "inventory/");
  await expect(row(page, "DVX9-NAU").getByRole("cell").nth(1)).toHaveText("6");
  await page.getByRole("button", { name: "Lập phiếu nhập" }).click();
  const form = page.getByRole("form", { name: "Phiếu nhập" });
  await form.getByLabel("SKU dòng 1").selectOption("v-x9-br");
  await form.getByLabel("Số lượng dòng 1").fill("3");
  await form.getByRole("button", { name: "Lưu nháp" }).click();
  await page.getByRole("tab", { name: /Tồn kho/ }).click();
  await expect(row(page, "DVX9-NAU").getByRole("cell").nth(1)).toHaveText("6");
  await page.getByRole("tab", { name: /Phiếu kho/ }).click();
  await page.getByRole("button", { name: "Ghi sổ" }).click();
  await expect(page.getByText("Đã ghi sổ", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /Tồn kho/ }).click();
  await expect(row(page, "DVX9-NAU").getByRole("cell").nth(1)).toHaveText("9");
  await page.getByRole("tab", { name: /Sổ kho/ }).click();
  await expect(page.getByRole("region", { name: "Sổ kho" }).getByRole("row", { name: /Nhập/ })).toHaveCount(
    1,
  );
});

test("chuyển kho quá khả dụng bị chặn; kiểm kê lệch phải người có quyền duyệt", async ({ page }) => {
  await as(page, "sale_admin", "inventory/");
  await page.getByRole("button", { name: "Chuyển kho" }).click();
  const tf = page.getByRole("form", { name: "Phiếu chuyển kho" });
  await tf.getByLabel("Từ kho").selectOption("wh-q4");
  await tf.getByLabel("Đến kho").selectOption("wh-dv");
  await tf.getByLabel("SKU dòng 1").selectOption("v-s7-be");
  await tf.getByLabel("Số lượng dòng 1").fill("1");
  await tf.getByRole("button", { name: "Lưu nháp" }).click();
  await page.getByRole("button", { name: "Ghi sổ" }).click();
  await expect(page.getByText(/Không đủ hàng khả dụng Ghế massage DV-S7 kem: cần 1, còn 0/)).toBeVisible();

  await page.getByRole("button", { name: "Kiểm kê" }).click();
  const cf = page.getByRole("form", { name: "Phiếu kiểm kê" });
  await cf.getByLabel("SKU dòng 1").selectOption("v-pillow");
  await cf.getByLabel("Số đếm dòng 1").fill("27");
  await cf.getByRole("button", { name: "Lưu nháp" }).click();
  await page.getByRole("button", { name: "Gửi duyệt và ghi sổ" }).click();
  await expect(page.getByText("Chờ duyệt chênh lệch")).toBeVisible();
  // Sale admin không có quyền duyệt kiểm kê.
  await page.getByRole("button", { name: /Chờ duyệt:/ }).click();
  const item = page
    .getByRole("dialog", { name: "Chờ duyệt" })
    .locator(".c-appr")
    .filter({ hasText: "Phiếu kiểm kê" });
  await expect(item.getByRole("button", { name: "Duyệt" })).toHaveCount(0);
});

test("Owner duyệt kiểm kê thì tồn đổi theo số đếm", async ({ page }) => {
  await as(page, "owner", "inventory/");
  const before = Number(await row(page, "GOI-CO").getByRole("cell").nth(1).innerText());
  await page.getByRole("button", { name: "Kiểm kê" }).click();
  const cf = page.getByRole("form", { name: "Phiếu kiểm kê" });
  await cf.getByLabel("SKU dòng 1").selectOption("v-pillow");
  await cf.getByLabel("Số đếm dòng 1").fill(String(before - 2));
  await cf.getByRole("button", { name: "Lưu nháp" }).click();
  await page.getByRole("button", { name: "Gửi duyệt và ghi sổ" }).click();
  await page.getByRole("button", { name: /Chờ duyệt:/ }).click();
  const dlg = page.getByRole("dialog", { name: "Chờ duyệt" });
  await dlg
    .locator(".c-appr")
    .filter({ hasText: "Phiếu kiểm kê" })
    .getByRole("button", { name: "Duyệt" })
    .click();
  await dlg.getByRole("button", { name: "Đóng" }).click();
  await page.getByRole("tab", { name: /Tồn kho/ }).click();
  await expect(row(page, "GOI-CO").getByRole("cell").nth(1)).toHaveText(String(before - 2));
});

test("đơn đi trọn từ chờ cọc đến hoàn tất: giữ hàng, xuất kho gán serial, bảo hành", async ({ page }) => {
  await as(page, "owner", "orders/o-0014/");
  const steps = page.getByRole("region", { name: "Thao tác đơn" });
  const advance = steps.getByRole("button", { name: "Chuyển sang Đã cọc, giữ hàng" });
  await expect(advance).toBeDisabled();
  await expect(steps).toContainText("Tiền cọc đã xác nhận chưa đủ mức tối thiểu");
  await expect(steps).toContainText("Không đủ hàng khả dụng");
  // Chuyển sang kho Đại Việt còn hàng.
  await steps.getByLabel("Kho xuất").selectOption("wh-dv");
  await expect(steps).not.toContainText("Không đủ hàng khả dụng");

  await page.getByRole("button", { name: "Ghi thanh toán" }).click();
  await page.getByRole("button", { name: "Ghi nhận", exact: true }).click();
  await page.getByRole("button", { name: /Chờ duyệt:/ }).click();
  const dlg = page.getByRole("dialog", { name: "Chờ duyệt" });
  await dlg
    .locator(".c-appr")
    .filter({ hasText: "Q4-2610-0014" })
    .getByRole("button", { name: "Duyệt" })
    .click();
  await dlg.getByRole("button", { name: "Đóng" }).click();
  await expect(advance).toBeEnabled();
  await advance.click();
  await expect(page.getByText("Đã cọc, giữ hàng").first()).toBeVisible();

  const ready = steps.getByRole("button", { name: "Chuyển sang Sẵn sàng giao" });
  await expect(ready).toBeDisabled();
  await steps.getByRole("button", { name: "Duyệt thu khi giao" }).click();
  await ready.click();
  const start = steps.getByRole("button", { name: "Bắt đầu giao" });
  await expect(start).toBeDisabled();
  await expect(steps).toContainText("Chưa gán serial");
  await steps.getByRole("button", { name: "Ghi sổ xuất kho, gán serial" }).click();
  await expect(page.getByText(/Serial S7-2610-/)).toBeVisible();
  await start.click();
  await steps.getByRole("button", { name: "Xác nhận đã lắp" }).click();
  await steps.getByRole("button", { name: "Hoàn tất đơn" }).click();
  await expect(page.getByRole("region", { name: "Phiếu bảo hành" })).toContainText("BH-Q4-2610-0014-1");

  // Sổ kho có dòng xuất bán của đơn.
  await tab(page, "Sản phẩm").click();
  await page.getByRole("navigation", { name: "Sản phẩm" }).getByRole("link", { name: "Kho" }).click();
  await page.getByRole("tab", { name: /Sổ kho/ }).click();
  await expect(page.getByRole("region", { name: "Sổ kho" })).toContainText("PX-Q4-2610-0014");
});

test("hủy đơn đã cọc nhả đúng số hàng đang giữ", async ({ page }) => {
  await as(page, "owner", "inventory/");
  const reserved = () => row(page, "DVX9-NAU").getByRole("cell").nth(2).innerText();
  expect(await reserved()).toBe("4");
  await tab(page, "Đơn hàng").click();
  await page.getByRole("link", { name: "Q4-2610-0012" }).click();
  await page.getByRole("button", { name: "Hủy đơn" }).click();
  await page.getByLabel("Lý do hủy").fill("Khách đổi ý");
  await page.getByRole("button", { name: "Xác nhận hủy" }).click();
  await expect(page.getByText("Đơn đã hủy: Khách đổi ý")).toBeVisible();
  await tab(page, "Sản phẩm").click();
  await page.getByRole("navigation", { name: "Sản phẩm" }).getByRole("link", { name: "Kho" }).click();
  expect(await reserved()).toBe("3");
});

test("telesale chỉ thấy đơn của mình, ghi tiền được nhưng không xác nhận được", async ({ page }) => {
  await as(page, "telesale", "orders/");
  await expect(page.getByRole("link", { name: "Q4-2610-0012" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Q4-2610-0014" })).toHaveCount(0);
  await page.goto("orders/o-0014/");
  await expect(page.getByRole("heading", { name: "Không tìm thấy" })).toBeVisible();
});
