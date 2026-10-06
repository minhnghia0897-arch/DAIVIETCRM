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

  // Điều hướng trong ứng dụng giữ trạng thái mô phỏng. Điện thoại mở menu ngăn kéo trước.
  const menu = page.getByRole("button", { name: "Mở menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "Cơ hội", exact: true }).click();
  const demo = page.getByRole("region", { name: "Demo, video call" });
  await expect(demo.getByRole("button", { name: /Nguyễn Thị Thu/ })).toBeVisible();
  await demo.getByRole("button", { name: /Nguyễn Thị Thu/ }).click();
  await page.getByRole("button", { name: "Tạo báo giá" }).click();
  await page.getByRole("button", { name: "Gửi báo giá", exact: true }).click();
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
  await page.getByRole("button", { name: "Tạo cơ hội", exact: true }).first().click();
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

for (const path of [
  "home/",
  "tasks/",
  "opportunities/",
  "households/",
  "orders/",
  "inbox/",
  "reports/",
  "policies/",
  "settings/integrations/",
  "settings/markets/",
  "settings/audit/",
]) {
  test(`không tràn ngang: ${path}`, async ({ page }) => {
    await as(page, "owner", path);
    await expect(page.locator(".c-main")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
}

test("không tràn ngang khi mở trình tạo báo giá (Owner thấy ô Giao cho)", async ({ page }) => {
  await as(page, "owner", "opportunities/");
  await page.getByRole("button", { name: /Nguyễn Thị Thu/ }).click();
  await page.getByRole("button", { name: "Tạo báo giá" }).click();
  await expect(page.getByRole("group", { name: "Kết quả định giá" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("Sản phẩm, Kho, Chính sách gom trong một tab, chuyển bằng tab con", async ({ page }) => {
  await as(page, "telesale", "products/");
  const nav = page.getByRole("navigation", { name: "Ứng dụng" });
  await expect(nav.getByRole("link", { name: "Kho", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Chính sách", exact: true })).toHaveCount(0);
  const sub = page.getByRole("navigation", { name: "Sản phẩm" });
  await sub.getByRole("link", { name: "Kho" }).click();
  await expect(page).toHaveURL(/inventory/);
  await expect(nav.getByRole("link", { name: "Sản phẩm" })).toHaveAttribute("aria-current", "page");
  await sub.getByRole("link", { name: "Chính sách" }).click();
  await expect(page).toHaveURL(/policies/);
});

test("menu là sidebar dọc: thu gọn còn biểu tượng; điện thoại mở bằng nút menu, đổi trang tự đóng", async ({
  page,
}, testInfo) => {
  await as(page, "owner", "home/");
  const nav = page.getByRole("navigation", { name: "Ứng dụng" });
  if (testInfo.project.name === "phone") {
    await expect(nav.getByRole("link", { name: "Đơn hàng" })).not.toBeInViewport();
    await page.getByRole("button", { name: "Mở menu" }).click();
    await nav.getByRole("link", { name: "Đơn hàng" }).click();
    await expect(page).toHaveURL(/orders/);
    await expect(nav.getByRole("link", { name: "Đơn hàng" })).not.toBeInViewport();
    return;
  }
  const box = await nav.boundingBox();
  expect(box!.height).toBeGreaterThan(box!.width);
  await expect(nav.getByText("Đơn hàng")).toBeVisible();
  await nav.getByRole("button", { name: "Thu gọn menu" }).click();
  await expect(nav.getByText("Đơn hàng")).toBeHidden();
  await expect(nav.getByRole("link", { name: "Đơn hàng" })).toBeVisible();
  await nav.getByRole("button", { name: "Mở rộng menu" }).click();
  await expect(nav.getByText("Đơn hàng")).toBeVisible();
});

test("ô tìm nhanh Ctrl K và phím tắt kiểu Slack", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Phím tắt dùng trên máy tính");
  await as(page, "owner", "home/");
  await page.keyboard.press("Control+k");
  const dlg = page.getByRole("dialog", { name: "Tìm nhanh" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("combobox").fill("0012");
  await expect(dlg.getByRole("option").first()).toContainText("Q4-2610-0012");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/orders\/o-0012/);
  await expect(dlg).toHaveCount(0);

  // Lead tìm theo tên, không dấu cũng được.
  await page.keyboard.press("Control+k");
  await dlg.getByRole("combobox").fill("nguyen thi thu");
  await dlg
    .getByRole("option", { name: /Nguyễn Thị Thu/ })
    .first()
    .click();
  await expect(page).toHaveURL(/opportunities/);
  await expect(page.getByRole("region", { name: "Hồ sơ lead Nguyễn Thị Thu" })).toBeVisible();

  // G rồi T về Việc cần làm; ? mở bảng phím tắt; Esc đóng.
  await page.locator("body").click({ position: { x: 600, y: 140 } });
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await expect(page).toHaveURL(/tasks/);
  await page.keyboard.press("?");
  await expect(dlg.getByLabel("Phím tắt")).toContainText("Mở ô tìm nhanh");
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
});

test("rê chuột vào việc hiện nút; Xong và Dời 1 giờ có Hoàn tác", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Rê chuột trên máy tính");
  // Việc giao cho Thảo: chỉ người nhận việc thấy nút thao tác.
  await as(page, "telesale", "tasks/");
  const today = page.getByRole("region", { name: "Hôm nay" });
  const row = today.getByRole("listitem").filter({ hasText: "Gọi hỏi thăm anh Khoa" });
  await row.hover();
  const bar = row.getByRole("group", { name: /Thao tác/ });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Dời 1 giờ" }).click();
  await expect(today.getByRole("listitem").filter({ hasText: "Gọi hỏi thăm anh Khoa" })).toContainText(
    "11:00",
  );
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  await expect(today.getByRole("listitem").filter({ hasText: "Gọi hỏi thăm anh Khoa" })).toContainText(
    "10:00",
  );

  const row2 = today.getByRole("listitem").filter({ hasText: "Gọi hỏi thăm anh Khoa" });
  await row2.hover();
  await row2.getByRole("button", { name: "Xong", exact: true }).click();
  await expect(today.getByText("Gọi hỏi thăm anh Khoa")).toHaveCount(0);
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  await expect(today.getByText("Gọi hỏi thăm anh Khoa")).toBeVisible();
});

test("sidebar in đậm mục có việc chưa xem; nhật ký agent có vạch Mới", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Sidebar hiện sẵn trên máy tính");
  await as(page, "telesale", "home/");
  const nav = page.getByRole("navigation", { name: "Ứng dụng" });
  const tasks = nav.getByRole("link", { name: "Việc cần làm" });
  await expect(tasks).toHaveClass(/is-unread/);
  await tasks.click();
  await nav.getByRole("link", { name: "Trang chủ" }).click();
  // Đã xem trang Việc cần làm: hết in đậm cho tới khi có việc mới.
  await expect(tasks).not.toHaveClass(/is-unread/);

  // Nhật ký agent (cả showroom) chỉ hiện cho người xem mọi lead: telesale không thấy.
  await expect(page.getByRole("heading", { name: "Agent đang làm" })).toHaveCount(0);

  // Agent làm thêm việc trong lúc mở trang: việc mới nằm trên vạch "Mới".
  await as(page, "sale_admin", "home/");
  await expect(page.getByLabel("Mới từ lúc mở trang")).toBeVisible({ timeout: 15000 });
});

test("telesale tìm nhanh chỉ thấy lead của mình", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Phím tắt dùng trên máy tính");
  await as(page, "telesale", "home/");
  await page.keyboard.press("Control+k");
  const dlg = page.getByRole("dialog", { name: "Tìm nhanh" });
  await dlg.getByRole("combobox").fill("Phạm Minh Đức");
  await expect(dlg.getByRole("option")).toHaveCount(0);
  await dlg.getByRole("combobox").fill("Hộ Phạm");
  await expect(dlg.getByRole("option")).toHaveCount(0);
});

test("đơn giao lắp đã gộp vào Đơn hàng: một tab, đường dẫn cũ chuyển sang Đơn hàng", async ({ page }) => {
  await as(page, "owner", "deliveries/");
  await expect(page).toHaveURL(/\/orders\/?$/);
  const nav = page.getByRole("navigation", { name: "Ứng dụng" });
  await expect(nav.getByRole("link", { name: "Đơn hàng", exact: true })).toHaveCount(1);
  await expect(nav.getByRole("link", { name: /giao lắp/ })).toHaveCount(0);
  // Bước giao lắp nằm trên hồ sơ đơn.
  await page.getByRole("link", { name: "Q4-2610-0013" }).click();
  await expect(page.getByRole("region", { name: "Giao lắp" })).toContainText("Ghi sổ xuất kho, gán serial");
});

test("trang không có hoặc ngoài quyền báo bằng tiếng Việt, không lộ dữ liệu", async ({ page }) => {
  await as(page, "telesale", "customers/c-lan/");
  await expect(page.getByRole("heading", { name: "Không tìm thấy" })).toBeVisible();
  await expect(page.getByText("This page could not be found")).toHaveCount(0);
  await expect(page.getByText("Phạm Ngọc Lan")).toHaveCount(0);
});

for (const path of [
  "inventory/",
  "orders/o-0014/",
  "customers/c-nam/",
  "team/targets/",
  "team/offboarding/",
  "team/coaching/",
  "tasks/",
]) {
  test(`không tràn ngang (thêm): ${path}`, async ({ page }) => {
    await as(page, "owner", path);
    await expect(page.locator("h1").first()).toBeAttached();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("telesale chỉ thấy hội thoại, số liệu của mình; Owner thấy cả showroom", async ({ page }) => {
  await as(page, "telesale", "inbox/");
  const list = page.getByLabel("Danh sách hội thoại");
  await expect(list.getByRole("button", { name: /Nguyễn Thị Thu/ })).toBeVisible();
  // Hội thoại của lead người khác và tin của người lạ chưa gắn lead: cần quyền xem mọi hội thoại.
  await expect(list.getByRole("button", { name: /Phạm Ngọc Lan/ })).toHaveCount(0);
  await expect(list.getByRole("button", { name: /phuong\.kr92/ })).toHaveCount(0);

  await as(page, "telesale", "home/");
  await expect(page.getByRole("progressbar", { name: "Tiến độ mục tiêu quý" })).toHaveCount(0);
  await as(page, "owner", "home/");
  await expect(page.getByRole("progressbar", { name: "Tiến độ mục tiêu quý" })).toBeVisible();
});

test("nút Quay lại trả đúng màn nghiệp vụ vừa rời: danh sách đơn → đơn → khách → đơn", async ({ page }) => {
  await as(page, "owner", "orders/");
  await page.getByRole("link", { name: "Q4-2610-0012" }).click();
  await expect(page.getByRole("heading", { name: "Đơn Q4-2610-0012" })).toBeVisible();
  await page.getByRole("link", { name: "Võ Thanh Tùng" }).first().click();
  await expect(page.getByRole("heading", { name: "Võ Thanh Tùng" })).toBeVisible();
  await page.getByRole("button", { name: "Quay lại đơn Q4-2610-0012" }).first().click();
  await expect(page.getByRole("heading", { name: "Đơn Q4-2610-0012" })).toBeVisible();
  await page.getByRole("button", { name: "Quay lại Đơn hàng" }).first().click();
  await expect(page).toHaveURL(/\/orders\/$/);

  // Mở thẳng bằng đường link: về danh sách cha.
  await page.goto("customers/c-tung/");
  await page.locator(".c-back", { hasText: "Khách" }).click();
  await expect(page).toHaveURL(/\/customers\/$/);
});

test("nhóm nội bộ kiểu Telegram: chủ đề mới, gửi tin che số khách, đính kèm tệp, kênh thông báo chỉ đọc", async ({
  page,
}) => {
  await as(page, "telesale", "chat/");
  const menu = page.getByRole("button", { name: "Về danh sách nhóm" });
  const side = page.getByRole("complementary", { name: "Danh sách nhóm" });
  await side.getByRole("button", { name: /Cả đội Showroom Q4/ }).click();
  if (await menu.isVisible()) await menu.click();
  await side.getByRole("button", { name: "Chủ đề mới" }).click();
  await side.getByLabel("Tên chủ đề mới").fill("Đơn Tết");
  await side.getByRole("button", { name: "Tạo chủ đề" }).click();
  await side.getByRole("button", { name: /Đơn Tết/ }).click();

  await page.getByLabel("Viết tin nhắn").fill("Khách mới 0912 345 678 hỏi ghế, xem đơn #Q4-2610-0012");
  await expect(page.getByText("Số điện thoại sẽ được che khi gửi")).toBeVisible();
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  const log = page.getByRole("log", { name: "Tin nhắn" });
  await expect(log).toContainText("091•••678");
  await expect(log).not.toContainText("0912 345 678");
  await expect(log.getByRole("link", { name: "#Q4-2610-0012" })).toBeVisible();

  await page.getByRole("button", { name: "Đính kèm" }).click();
  await page.getByLabel("Chọn tệp").setInputFiles({
    name: "danh-sach-giao.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("pdf"),
  });
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(log).toContainText("danh-sach-giao.pdf");

  // Kênh thông báo: telesale chỉ đọc.
  if (await menu.isVisible()) await menu.click();
  await side.getByRole("button", { name: /Thông báo showroom/ }).click();
  await expect(page.getByText("Kênh thông báo: chỉ quản trị kênh đăng tin.")).toBeVisible();
});
