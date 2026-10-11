import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Lưu khóa đấu nối thật (CLAUDE.md 10.1, 10.2): khóa vào Supabase Vault, không hiện lại, có nhật ký kiểm toán;
// đấu nối chưa có bộ nối thì không giả lập "Đã kết nối".

test("Owner dán khóa SMTP: lưu vào kho bí mật, không hiện lại, có nhật ký", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Sửa dữ liệu một lần là đủ");
  const secret = "matkhau-smtp-thu-9f3k";
  await login(page, USERS.owner);
  await page.goto("/settings/integrations");
  const row = page.getByRole("listitem", { name: "Email gửi lời mời" });
  await row.getByRole("button", { name: "Kết nối" }).click();
  const form = row.getByRole("form", { name: "Kết nối nhanh Email gửi lời mời" });
  await form.getByLabel("Mật khẩu SMTP").fill(secret);
  await form.getByLabel("Máy chủ SMTP").fill("smtp.example.com");
  await form.getByLabel("Tên đăng nhập").fill("crm");
  await form.getByLabel("Địa chỉ gửi").fill("no-reply@example.com");
  await form.getByRole("button", { name: "Lưu khóa và cấu hình" }).click();
  await expect(page.getByRole("status")).toContainText("chưa kiểm tra được kết nối thật");

  // Tải lại: khóa đọc từ database (chỉ tên và ngày), trạng thái không bị giả thành "Đã kết nối".
  await page.reload();
  await expect(row.getByText("Chưa kết nối")).toBeVisible();
  await row.getByRole("button", { name: "Email gửi lời mời" }).click();
  await row.getByRole("tab", { name: "Bí mật" }).click();
  await expect(row.getByText(/Đã có, cập nhật/)).toBeVisible();
  expect(await page.content()).not.toContain(secret);

  await page.goto("/settings/audit");
  const audit = page.getByRole("region", { name: "Nhật ký kiểm toán phân quyền và người dùng" });
  await expect(audit.getByRole("row").filter({ hasText: "Lưu khóa đấu nối" }).first()).toContainText(
    "đấu nối: Email gửi lời mời",
  );
  expect(await page.content()).not.toContain(secret);
});

test("sale admin không vào được Tích hợp", async ({ page }) => {
  await login(page, USERS.saleAdmin);
  await page.goto("/settings/integrations");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});
