import http from "node:http";

import { expect, test, type Page } from "@playwright/test";

import { USERS, login } from "./helpers";

// Bot Telegram thật (CLAUDE.md 10.1, 10.3 telegram_bot): Owner chỉ dán token, CRM tự kiểm bot, nối webhook kèm mã bí
// mật, đăng ký menu lệnh; webhook sai mã thì không đọc nội dung; nhân viên liên kết rồi gõ /viec, /lead, /giaohang,
// /cskh thì bot trả lời vào tin riêng, đúng phạm vi quyền, không có số điện thoại.
//
// Chạy app với TELEGRAM_API_BASE=http://127.0.0.1:4013 và E2E_TELEGRAM_MOCK=1 để bot gọi máy chủ Telegram giả của bài
// này (không gọi ra Telegram thật); không đặt thì bỏ qua cả nhóm.

const PATH = "/api/webhooks/telegram";
/** Mã bí mật webhook CRM tự tạo khi Owner kết nối; bài đầu đọc lại từ lệnh setWebhook gửi máy chủ giả. */
let SECRET = "";
// Token giả đúng định dạng; mọi lệnh gọi đi tới máy chủ Telegram giả.
const FAKE_TOKEN = "1234567890:AAthu-khong-goi-ra-ngoai-chi-de-kiem-thu";
const RUN = Date.now() % 1_000_000;
const TG_ADMIN = 7_100_000 + RUN;
const TG_THAO = 7_200_000 + RUN;

/** Tin "bot bị chặn trong trò chuyện riêng": bộ xử lý bỏ qua, nên không gọi ra Telegram. */
const update = (id: number) => ({
  update_id: id,
  my_chat_member: {
    chat: { id: 9_900_000 + id, type: "private" },
    from: { id: 4242, is_bot: false },
    new_chat_member: { status: "kicked" },
  },
});

let nextId = 780_000 + (RUN % 100_000) * 10;
/** Tin nhắn người dùng gửi bot (riêng hoặc trong nhóm). */
const say = (
  from: number,
  text: string,
  chat: { id: number; type: string } = { id: from, type: "private" },
) => ({
  update_id: nextId++,
  message: { message_id: nextId, from: { id: from, is_bot: false }, chat, text },
});

type Call = { method: string; body: Record<string, unknown> };
const calls: Call[] = [];
let mock: http.Server | null = null;
let messageId = 1000;

test.beforeAll(async ({}, testInfo) => {
  // Chỉ bản laptop chạy các bài này (beforeEach bỏ qua bản phone). Bản phone mà cũng mở cổng 4013 thì hai tiến trình
  // tranh nhau: bản phone giữ cổng rồi đóng ngay khi xong, bản laptop gọi vào cổng đã đóng.
  if (!process.env.E2E_TELEGRAM_MOCK || testInfo.project.name !== "laptop") return;
  mock = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const method = (req.url ?? "").split("/").pop() ?? "";
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      calls.push({ method, body });
      const result =
        method === "getMe"
          ? { id: 1, is_bot: true, username: "DaiVietQ4Bot" }
          : method === "sendMessage"
            ? { message_id: messageId++ }
            : true;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result }));
    });
  });
  await new Promise<void>((ok, fail) => {
    mock!.once("error", fail);
    mock!.listen(4013, "127.0.0.1", () => ok());
  }).catch(() => {
    mock = null;
  });
});

test.afterAll(() => {
  mock?.close();
});

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    !process.env.E2E_TELEGRAM_MOCK,
    "Cần chạy app với TELEGRAM_API_BASE trỏ tới máy chủ Telegram giả",
  );
  test.skip(testInfo.project.name !== "laptop", "Gọi bot một lần là đủ");
});

/** Tin bot gửi vào một chat, sau một mốc (độ dài mảng calls lúc trước khi gửi lệnh). */
async function sentTo(chatId: number, after: number, n = 1) {
  await expect
    .poll(
      () => calls.slice(after).filter((c) => c.method === "sendMessage" && c.body.chat_id === chatId).length,
    )
    .toBeGreaterThanOrEqual(n);
  return calls
    .slice(after)
    .filter((c) => c.method === "sendMessage" && c.body.chat_id === chatId)
    .map((c) => ({
      text: String(c.body.text ?? ""),
      keyboard: (
        (
          c.body.reply_markup as {
            inline_keyboard?: { text: string; url?: string; callback_data?: string }[][];
          }
        )?.inline_keyboard ?? []
      ).flat(),
    }));
}

test("Owner chỉ dán token: CRM tự kiểm bot, nối webhook, đăng ký menu lệnh", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/settings/integrations");
  const row = page.getByRole("listitem", { name: "Thông báo Telegram cho nhân viên" });
  await row
    .getByRole("button", { name: /Kết nối/ })
    .first()
    .click();
  const form = row.getByRole("form", { name: "Kết nối nhanh Thông báo Telegram cho nhân viên" });
  await form.getByLabel("Token của bot (từ @BotFather)").fill(FAKE_TOKEN);
  // Chỉ cần token: tên bot và mã bí mật webhook CRM tự điền, tự tạo.
  await expect(form.getByLabel(/Mã bí mật webhook/)).toHaveCount(0);
  const before = calls.length;
  await form.getByRole("button", { name: /Lưu khóa/ }).click();
  await expect(page.getByRole("status")).toContainText("đã kết nối");
  await expect(page.getByRole("status")).toContainText("menu đã có lệnh /viec, /lead, /giaohang, /cskh");

  const hook = calls.slice(before).find((c) => c.method === "setWebhook");
  expect(String(hook?.body.url)).toMatch(/\/api\/webhooks\/telegram$/);
  SECRET = String(hook?.body.secret_token);
  expect(SECRET).toMatch(/^[0-9a-f]{48}$/);
  const menu = calls.slice(before).find((c) => c.method === "setMyCommands");
  expect((menu?.body.commands as { command: string }[]).map((c) => c.command)).toEqual([
    "viec",
    "lead",
    "giaohang",
    "cskh",
  ]);
  // Khóa không bao giờ hiện lại trên màn hình.
  await page.reload();
  await expect(page.getByRole("listitem", { name: "Thông báo Telegram cho nhân viên" })).toContainText(
    "Đã kết nối",
  );
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

/** Nhân viên tự liên kết: tạo link ở Cài đặt, Thông báo Telegram rồi bấm Start (gửi /start <mã> cho bot). */
async function link(page: Page, email: string, tgId: number) {
  await login(page, email);
  await page.goto("/settings/notifications");
  const card = page.getByRole("region", { name: "Liên kết Telegram" });
  await card.getByRole("button", { name: /Tạo link/ }).click();
  const href = await card.getByRole("link", { name: "Mở Telegram" }).getAttribute("href");
  const code = new URL(href!).searchParams.get("start")!;
  const before = calls.length;
  expect(await postUpdate(page, say(tgId, `/start ${code}`), SECRET)).toBe(200);
  const [m] = await sentTo(tgId, before);
  expect(m.text).toContain("Đã liên kết");
}

async function ask(page: Page, tgId: number, text: string, chat?: { id: number; type: string }) {
  const before = calls.length;
  expect(await postUpdate(page, say(tgId, text, chat), SECRET)).toBe(200);
  const [m] = await sentTo(tgId, before);
  // Không bao giờ có số điện thoại của khách trong tin (CLAUDE.md mục 5, 12).
  expect(m.text).not.toMatch(/\d{7,}/);
  // Ngày luôn dạng 13/10, không lẫn 13-10 (Intl vi-VN ra dấu gạch tùy bản ICU).
  expect(m.text).not.toMatch(/\b\d{2}-\d{2}\b/);
  return m;
}

test("nhân viên liên kết rồi gõ lệnh: bot trả lời vào tin riêng, đúng phạm vi, nút mở thẳng CRM", async ({
  page,
}) => {
  await link(page, USERS.thao, TG_THAO);
  await link(page, USERS.saleAdmin, TG_ADMIN);
  // Đã liên kết mà bấm /start lại thì bot nhắc lệnh, không bảo liên kết lại.
  expect((await ask(page, TG_THAO, "/start")).text).toContain("đã liên kết");

  // Telesale: chỉ lead của mình; nút mở thẳng hồ sơ lead trên CRM.
  const lead = await ask(page, TG_THAO, "/lead");
  expect(lead.text).toContain("Lead 3 ngày gần nhất của tôi");
  for (const b of lead.keyboard) expect(b.url).toMatch(/\/leads\/[0-9a-f-]{36}$/);
  expect(lead.keyboard.some((b) => b.url?.endsWith("33333333-3333-4333-8333-000000000002"))).toBe(false);

  // Sale admin (lead.view_all): lead của cả showroom.
  expect((await ask(page, TG_ADMIN, "/lead")).text).toContain("Lead 3 ngày gần nhất của cả showroom");

  // Sale admin (phiên đăng nhập hiện tại) chọn mức Đầy đủ: mỗi lead có thêm tóm tắt liên hệ, thông tin còn thiếu,
  // giờ vào CRM; vẫn không có số điện thoại (ask kiểm).
  await page.goto("/settings/notifications");
  await page.getByRole("radio", { name: /Đầy đủ/ }).click();
  await expect(page.getByRole("status")).toContainText("Đã chọn: Đầy đủ");
  const full = await ask(page, TG_ADMIN, "/lead");
  expect(full.text).toMatch(/Chưa liên hệ lần nào|Đã liên hệ \d+ lần/);
  expect(full.text).toContain("Còn thiếu:");
  expect(full.text).toContain("Vào CRM");
  // Owner chốt 14/10: mức Đầy đủ có họ tên đầy đủ và số dạng che (lead mẫu Nguyễn Thị Thu, số Hàn), không có số thật.
  expect(full.text).toContain("Nguyễn Thị Thu (Hàn)");
  expect(full.text).toMatch(/SĐT \+82 10•+\d{4}/);

  const viec = await ask(page, TG_THAO, "/viec");
  expect(viec.text).toContain("Việc hôm nay");
  for (const b of viec.keyboard.filter((x) => x.callback_data))
    expect(b.callback_data).toMatch(/^t:(done|snz):[0-9a-f-]{36}$/);

  // Làm nhanh ngay dưới tin /viec: Dời 1 giờ.
  const snooze = viec.keyboard.find((b) => b.callback_data?.startsWith("t:snz:"));
  if (snooze) {
    const before = calls.length;
    await postUpdate(
      page,
      {
        update_id: nextId++,
        callback_query: { id: `cb${nextId}`, from: { id: TG_THAO }, data: snooze.callback_data },
      },
      SECRET,
    );
    await expect
      .poll(() => calls.slice(before).find((c) => c.method === "answerCallbackQuery")?.body.text)
      .toMatch(/Đã hẹn lại 1 giờ|đã xử lý rồi/);
  }

  expect((await ask(page, TG_ADMIN, "/giaohang")).text).toContain("Giao hàng 7 ngày của cả showroom");
  const care = await ask(page, TG_ADMIN, "/cskh");
  expect(care.text).toContain("Khách cần chăm sóc · 3 ngày gần nhất");
  for (const b of care.keyboard)
    expect(b.url).toMatch(/\/inbox\?c=[0-9a-f-]{36}$|\/customers\/[0-9a-f-]{36}$/);

  // Gõ lệnh trong nhóm: danh sách gửi vào tin riêng, nhóm chỉ nhận một dòng báo.
  const group = { id: -1_000_000_000_000 - RUN, type: "supergroup" };
  const before = calls.length;
  expect(await postUpdate(page, say(TG_THAO, "/cskh@DaiVietQ4Bot", group), SECRET)).toBe(200);
  await sentTo(TG_THAO, before);
  const [inGroup] = await sentTo(group.id, before);
  expect(inGroup.text).toContain("Đã gửi vào tin riêng");
});

test("tài khoản Telegram chưa liên kết thì bot không trả dữ liệu CRM", async ({ page }) => {
  const stranger = 7_300_000 + RUN;
  const m = await ask(page, stranger, "/lead");
  expect(m.text).toContain("chưa liên kết");
  expect(m.text).toContain("Tạo link liên kết");
  // Chỉ có nút mở trang liên kết (phải đăng nhập CRM), không có dữ liệu lead nào.
  expect(m.keyboard.map((b) => b.url)).toEqual([expect.stringMatching(/\/settings\/notifications$/)]);
  // Gõ /start trống cũng được chỉ cách liên kết.
  const start = await ask(page, stranger, "/start");
  expect(start.text).toContain("Tạo link liên kết");
});

test("việc nền đẩy tin chạy được qua route cron của CRM", async ({ page }) => {
  test.skip(!process.env.E2E_CRON_SECRET, "Cần chạy app với CRON_SECRET giống E2E_CRON_SECRET");
  const res = await page.request.post("/api/cron/telegram-outbound", {
    headers: { authorization: `Bearer ${process.env.E2E_CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });
  // Không có mã thì từ chối.
  expect((await page.request.post("/api/cron/telegram-outbound")).status()).toBe(401);
});
