import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Màn Nhóm nội bộ hiện đúng các nhóm Telegram đã nối với CRM (CLAUDE.md 10.3): ai cũng xem được nhóm của đội,
// chỉ người có settings.integrations đổi được công dụng. CRM không đọc trò chuyện của nhóm.

test("danh sách nhóm là nhóm thật đã nối, kèm công dụng và trạng thái", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/chat");
  const list = page.getByRole("complementary", { name: "Danh sách nhóm" });

  await expect(list.getByRole("button", { name: /Cả đội Showroom Q4/ })).toContainText(
    "Kênh thông báo chung",
  );
  await expect(list.getByRole("button", { name: /Kho & giao lắp/ })).toContainText("Nhóm giao hàng");
  // Bot vừa vào nhóm, chưa được giao việc gì.
  await expect(list.getByRole("button", { name: /Telesale/ })).toContainText("Chờ gán");
  // Bot đã rời nhóm: vẫn hiện để Owner biết, nhưng không gán lại được.
  await expect(list.getByRole("button", { name: /Nhóm cũ 2025/ })).toContainText("Bot đã rời nhóm");
});

test("nói rõ CRM không đọc trò chuyện của nhóm", async ({ page }) => {
  await login(page, USERS.thao);
  await page.goto("/chat");
  // Trên điện thoại màn mở ở danh sách, chọn nhóm rồi mới thấy khung bên phải.
  await page.getByRole("button", { name: /Kho & giao lắp/ }).click();
  await expect(page.getByRole("region", { name: "Trò chuyện của nhóm" })).toContainText("CRM không đọc");
});

test("telesale xem được nhóm nhưng không đổi được công dụng", async ({ page }) => {
  await login(page, USERS.thao);
  await page.goto("/chat");
  await page.getByRole("button", { name: /Kho & giao lắp/ }).click();
  const card = page.getByRole("region", { name: "Công dụng của nhóm" });
  await expect(card).toContainText("Nhóm giao hàng");
  await expect(card.getByRole("radiogroup", { name: "Công dụng của nhóm" })).toHaveCount(0);
});

test("Owner đổi công dụng nhóm, nhóm cũ giữ công dụng đó chuyển sang Ngưng", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Sửa dữ liệu một lần là đủ");
  await login(page, USERS.owner);
  await page.goto("/chat");

  // Dùng nhóm riêng của bài kiểm thử, để các bài chỉ đọc chạy song song không bị ảnh hưởng.
  const list = page.getByRole("complementary", { name: "Danh sách nhóm" });
  await list.getByRole("button", { name: /Nhóm thử phân công/ }).click();
  const card = page.getByRole("region", { name: "Công dụng của nhóm" });
  await card.getByRole("radio", { name: "Nhóm chăm sóc khách hàng" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu công dụng nhóm");
  await expect(list.getByRole("button", { name: /Nhóm thử phân công/ })).toContainText("Đang dùng");

  // Tạm ngưng rồi trả về Chưa dùng, để chạy lại bài kiểm thử vẫn đúng.
  await card.getByRole("button", { name: "Tạm ngưng nhóm này" }).click();
  await expect(list.getByRole("button", { name: /Nhóm thử phân công/ })).toContainText("Ngưng");
  await card.getByRole("radio", { name: "Chưa dùng" }).click();
  await expect(page.getByRole("status")).toContainText("Đã bỏ công dụng của nhóm");
});

test("bot đã rời nhóm thì không gán lại được từ CRM", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/chat");
  await page.getByRole("button", { name: /Nhóm cũ 2025/ }).click();
  const card = page.getByRole("region", { name: "Công dụng của nhóm" });
  await expect(card).toContainText("Bot đã rời nhóm này");
  await expect(card.getByRole("radiogroup", { name: "Công dụng của nhóm" })).toHaveCount(0);
});
