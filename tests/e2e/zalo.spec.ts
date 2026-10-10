import { createHash } from "node:crypto";
import http from "node:http";

import { expect, test, type Page } from "@playwright/test";

import { USERS, login } from "./helpers";

// Bộ nối Zalo OA trên bản thật: kết nối (làm mới token, kiểm đúng OA), kiểm chữ ký webhook, tin đến vào Hội thoại
// chung, trả lời tin tư vấn, khách chia sẻ số qua form. Máy chủ Zalo là bản giả chạy trong bài kiểm thử: chạy app với
// ZALO_OAUTH_URL=http://127.0.0.1:4011/v4/oa/access_token, ZALO_API_BASE=http://127.0.0.1:4011 và E2E_ZALO_MOCK=1.

const APP_ID = "2718281828459045";
const OA_ID = "4318000000000000001";
const OA_KEY = "oa-secret-key-thu";
const USER = `55${Date.now() % 1_000_000_000}`;
// Tên riêng cho mỗi lần chạy để chạy lại không lẫn với hội thoại của lần trước.
const NAME = `Phạm Thu Hà ${USER.slice(-4)}`;

test.describe.configure({ mode: "serial" });

let mock: http.Server | null = null;
const sent: unknown[] = [];

test.beforeAll(async () => {
  if (!process.env.E2E_ZALO_MOCK) return;
  let n = 0;
  mock = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const path = new URL(req.url ?? "/", "http://x").pathname;
      const reply = (obj: unknown) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (path === "/v4/oa/access_token")
        return reply({
          access_token: `acc-${++n}-0123456789`,
          refresh_token: `ref-${n}-0123456789`,
          expires_in: "90000",
        });
      if (path === "/v2.0/oa/getoa") return reply({ error: 0, data: { oa_id: OA_ID, name: "Đại Việt Q4" } });
      if (path === "/v3.0/oa/message/cs") {
        sent.push(JSON.parse(raw));
        return reply({ error: 0, data: { message_id: `z_out_${sent.length}_${USER}`, user_id: USER } });
      }
      if (path === "/v3.0/oa/user/detail") return reply({ error: 0, data: { display_name: NAME } });
      reply({ error: -201 });
    });
  });
  await new Promise<void>((ok, fail) => {
    mock!.once("error", fail);
    mock!.listen(4011, "127.0.0.1", () => ok());
  }).catch(() => {
    mock = null;
  });
});

test.afterAll(() => mock?.close());

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    !process.env.E2E_ZALO_MOCK,
    "Cần chạy app với ZALO_OAUTH_URL, ZALO_API_BASE trỏ tới máy chủ Zalo giả",
  );
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
});

/** Gọi webhook từ trong trang (cùng địa chỉ) để không đi qua proxy của máy chạy kiểm thử. */
async function post(page: Page, event: Record<string, unknown>, key = OA_KEY) {
  const timestamp = String(Date.now());
  const raw = JSON.stringify({ app_id: APP_ID, timestamp, ...event });
  const mac = createHash("sha256").update(`${APP_ID}${raw}${timestamp}${key}`).digest("hex");
  await page.goto("/login");
  return page.evaluate(
    async ({ raw, mac }) =>
      (
        await fetch("/api/webhooks/zalo", {
          method: "POST",
          headers: { "content-type": "application/json", "x-zevent-signature": `mac=${mac}` },
          body: raw,
        })
      ).status,
    { raw, mac },
  );
}

const text = (mid: string, body: string) => ({
  event_name: "user_send_text",
  sender: { id: USER },
  recipient: { id: OA_ID },
  message: { msg_id: mid, text: body },
});

test("Owner kết nối Zalo OA: làm mới token được và đúng OA thì Đã kết nối", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/settings/integrations");
  const row = page.getByRole("listitem", { name: "Zalo OA" });
  await row
    .getByRole("button", { name: /Kết nối/ })
    .first()
    .click();
  const form = row.getByRole("form", { name: "Kết nối nhanh Zalo OA" });
  await form.getByLabel(/App Secret/).fill("app-secret-zalo-thu");
  await form.getByLabel(/OA Secret Key/).fill(OA_KEY);
  await form.getByLabel(/Refresh token/).fill("refresh-token-dau-tien-0123456789");
  await form.getByLabel("App ID ứng dụng Zalo").fill(APP_ID);
  await form.getByLabel("ID Zalo OA").fill(OA_ID);
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: /Lưu khóa/ }).click();
  await expect(page.getByRole("status")).toContainText("Zalo OA đã kết nối");
  await page.reload();
  await expect(page.getByRole("listitem", { name: "Zalo OA" })).toContainText("Đã kết nối");
  expect(await page.content()).not.toContain(OA_KEY);
});

test("sai chữ ký thì không nhận tin", async ({ page }) => {
  expect(await post(page, text(`z.bad.${USER}`, "x"), "khoa-sai")).toBe(401);
});

test("tin Zalo vào Hội thoại chung; trả lời tin tư vấn miễn phí trong 48 giờ", async ({ page }) => {
  expect(await post(page, text(`z.1.${USER}`, "OA ơi, máy lọc nước giá bao nhiêu?"))).toBe(200);
  expect(await post(page, text(`z.1.${USER}`, "OA ơi, máy lọc nước giá bao nhiêu?"))).toBe(200);

  await login(page, USERS.saleAdmin);
  await page.goto("/inbox");
  await page.getByLabel("Lọc theo kênh").selectOption("zalo");
  const item = page
    .getByRole("list", { name: "Danh sách hội thoại" })
    .getByRole("button", { name: new RegExp(NAME) });
  await expect(item).toBeVisible({ timeout: 15_000 });
  await expect(item).toContainText("Zalo");
  await item.click();
  const log = page.getByRole("log", { name: "Tin nhắn" });
  await expect(log.getByText("OA ơi, máy lọc nước giá bao nhiêu?")).toHaveCount(1);
  await expect(page.getByText(/Miễn phí còn 1 ngày/)).toBeVisible();

  await page.getByLabel("Nội dung trả lời").fill("Dạ máy lọc nước bên em từ 8 triệu ạ");
  await page.getByRole("button", { name: "Gửi" }).click();
  await expect(log.getByText("Dạ máy lọc nước bên em từ 8 triệu ạ")).toBeVisible();
  await expect(log.getByText("✓")).toBeVisible();
  if (mock)
    expect(sent.at(-1)).toEqual({
      recipient: { user_id: USER },
      message: { text: "Dạ máy lọc nước bên em từ 8 triệu ạ" },
    });
});

test("khách gửi số qua form Zalo: số vào hồ sơ, dòng hoạt động không lộ số", async ({ page }) => {
  expect(
    await post(page, {
      event_name: "user_submit_info",
      sender: { id: USER },
      recipient: { id: OA_ID },
      info: { name: NAME, phone: "0912 345 678" },
    }),
  ).toBe(200);
  await login(page, USERS.saleAdmin);
  await page.goto("/inbox");
  await page.getByRole("button", { name: new RegExp(NAME) }).click();
  await expect(
    page.getByRole("log", { name: "Tin nhắn" }).getByText("Khách đã chia sẻ thông tin liên hệ qua Zalo"),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Mở hồ sơ lead" }).click();
  await expect(page.getByText("Khách chia sẻ số điện thoại qua Zalo OA").first()).toBeVisible();
  expect(await page.content()).not.toContain("0912345678");
});
