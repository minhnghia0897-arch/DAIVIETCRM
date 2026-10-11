import { expect, test, type Page } from "@playwright/test";

import { USERS, login } from "./helpers";

// Webhook nhận tin Telegram (CLAUDE.md 10.1): Telegram gửi kèm mã bí mật trong header; sai mã thì không đọc nội dung,
// không ghi vào database. Mã bí mật và token do Owner dán ở Cài đặt → Tích hợp, lưu trong Supabase Vault.

const PATH = "/api/webhooks/telegram";
const SECRET = "ma-bi-mat-webhook-thu-7k2f";
// Token giả, chỉ để qua bước kiểm định dạng; tin dùng trong bài kiểm thử không gọi ra Telegram.
const FAKE_TOKEN = "1234567890:AAthu-khong-goi-ra-ngoai-chi-de-kiem-thu";

/** Tin "bot bị chặn trong trò chuyện riêng": bộ xử lý bỏ qua, nên không gọi ra Telegram. */
const update = (id: number) => ({
  update_id: id,
  my_chat_member: {
    chat: { id: 9_900_000 + id, type: "private" },
    from: { id: 4242, is_bot: false },
    new_chat_member: { status: "kicked" },
  },
});

test.describe.configure({ mode: "serial" });

test("Owner dán token và mã bí mật webhook", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Sửa dữ liệu một lần là đủ");
  await login(page, USERS.owner);
  await page.goto("/settings/integrations");
  const row = page.getByRole("listitem", { name: "Thông báo Telegram cho nhân viên" });
  await row
    .getByRole("button", { name: /Kết nối/ })
    .first()
    .click();
  const form = row.getByRole("form", { name: "Kết nối nhanh Thông báo Telegram cho nhân viên" });
  await form.getByLabel("Token của bot (từ @BotFather)").fill(FAKE_TOKEN);
  await form.getByLabel(/Mã bí mật webhook/).fill(SECRET);
  await form.getByLabel("Tên bot").fill("DaiVietQ4Bot");
  await form.getByRole("button", { name: /Lưu khóa/ }).click();
  await expect(page.getByRole("status")).toContainText("kho bí mật");
  // Khóa không bao giờ hiện lại trên màn hình.
  await page.reload();
  expect(await page.content()).not.toContain(SECRET);
  expect(await page.content()).not.toContain(FAKE_TOKEN);
});

/** Gọi webhook từ trong trang (cùng địa chỉ) để không đi qua proxy của máy chạy kiểm thử. */
async function postUpdate(page: Page, body: unknown, secret?: string) {
  await page.goto("/login");
  return page.evaluate(
    async ({ body, secret, path }) => {
      const res = await fetch(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}),
        },
        body: JSON.stringify(body),
      });
      return res.status;
    },
    { body, secret, path: PATH },
  );
}

test("sai mã bí mật thì webhook từ chối", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Gọi API một lần là đủ");
  expect(await postUpdate(page, update(770001), "sai-ma")).toBe(401);
});

test("thiếu header mã bí mật thì webhook từ chối", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Gọi API một lần là đủ");
  expect(await postUpdate(page, update(770002))).toBe(401);
});

test("đúng mã bí mật thì nhận tin, gửi lại cùng update_id vẫn trả 200", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Gọi API một lần là đủ");
  const id = 770_100 + (Date.now() % 1000);
  expect(await postUpdate(page, update(id), SECRET)).toBe(200);
  // Telegram gửi lại khi phản hồi chậm: vẫn trả 200, bộ xử lý bỏ qua bản trùng theo update_id.
  expect(await postUpdate(page, update(id), SECRET)).toBe(200);
});
