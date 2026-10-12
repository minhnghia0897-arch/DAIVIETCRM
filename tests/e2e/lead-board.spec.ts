import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Lead dạng bảng theo giai đoạn (Kanban) trong menu Lead (12/10/2026): kéo thả trên máy tính, ô "Chuyển sang" trên
// điện thoại; chỉ những bước người được chuyển tay (CLAUDE.md mục 6), database kiểm lại bốn thông tin bắt buộc.

test("telesale xem bảng của mình, không thấy lead người khác", async ({ page }) => {
  await login(page, USERS.thao);
  await page.goto("/leads");
  await page.getByRole("link", { name: "Bảng theo giai đoạn" }).click();
  await expect(page).toHaveURL(/layout=board/);
  const board = page.getByLabel("Bảng lead theo giai đoạn");
  await expect(board.getByRole("region", { name: "Mới" })).toBeVisible();
  await expect(board.getByRole("link", { name: "Nguyễn Thị Thu" })).toBeVisible();
  await expect(board.getByRole("link", { name: "Phạm Ngọc Lan" })).toHaveCount(0);
  // Không có nút "Cả showroom" khi không xem được mọi lead.
  await expect(page.getByRole("link", { name: "Cả showroom" })).toHaveCount(0);
  await page.getByRole("link", { name: "Danh sách" }).click();
  await expect(page).not.toHaveURL(/layout=board/);
});

test("kéo lead qua các giai đoạn theo luật; thiếu thông tin thì chưa sang Demo; thất bại cần lý do", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
  const phone = `09${String(Date.now()).slice(-8)}`;
  const name = `Khách bảng ${phone.slice(-4)}`;

  await login(page, USERS.saleAdmin);
  await page.goto("/leads");
  await page.getByRole("button", { name: "Tạo lead" }).click();
  const form = page.getByRole("form", { name: "Tạo lead" });
  await form.getByLabel("Họ tên").fill(name);
  await form.getByLabel("Số điện thoại").fill(phone);
  await form.getByLabel("Nguồn").selectOption({ label: "Khách đến showroom" });
  await form.getByRole("button", { name: "Lưu lead" }).click();
  await expect(form.getByRole("status")).toContainText(/Đã tạo lead/);

  await page.goto(`/leads?layout=board&q=${encodeURIComponent(name)}`);
  const board = page.getByLabel("Bảng lead theo giai đoạn");
  const col = (stage: string) => board.getByRole("region", { name: stage, exact: true });
  const card = page.getByRole("listitem", { name });
  await expect(col("Mới").getByRole("listitem", { name })).toBeVisible();
  await expect(card.getByText("Thiếu 4 thông tin")).toBeVisible();

  // Kéo thả sang Đã liên hệ.
  await card.dragTo(col("Đã liên hệ"));
  await expect(page.getByRole("status")).toContainText("Đã chuyển sang Đã liên hệ");
  await expect(col("Đã liên hệ").getByRole("listitem", { name })).toBeVisible();

  // Báo giá, cọc, chốt không có trong ô Chuyển sang; thiếu bốn thông tin thì database chặn sang Demo.
  const moveTo = card.getByLabel(`Chuyển ${name} sang`);
  await expect(moveTo.locator("option", { hasText: "Đã gửi báo giá" })).toHaveCount(0);
  await moveTo.selectOption({ label: "Đã tư vấn, demo" });
  await expect(page.getByRole("status")).toContainText("Thiếu thông tin bắt buộc");
  await expect(col("Đã liên hệ").getByRole("listitem", { name })).toBeVisible();

  // Kéo sang cột Đã gửi báo giá thì báo lý do, thẻ đứng yên.
  await card.dragTo(col("Đã gửi báo giá"));
  await expect(page.getByRole("status")).toContainText("không kéo tay được");
  await expect(col("Đã liên hệ").getByRole("listitem", { name })).toBeVisible();

  // Thất bại: chọn lý do rồi xác nhận.
  await card.getByLabel(`Chuyển ${name} sang`).selectOption({ label: "Thất bại" });
  const dialog = page.getByRole("dialog", { name: "Đánh dấu thất bại" });
  await dialog.getByLabel("Lý do thất bại").selectOption({ label: "Hết nhu cầu, chỉ hỏi giá" });
  await dialog.getByRole("button", { name: "Xác nhận thất bại" }).click();
  await expect(page.getByRole("status")).toContainText("Đã đánh thất bại");
  await expect(col("Thất bại").getByRole("listitem", { name })).toBeVisible();
  // Lead đã đóng không còn ô Chuyển sang.
  await expect(page.getByLabel(`Chuyển ${name} sang`)).toHaveCount(0);
});
