import { createHmac } from "node:crypto";
import http from "node:http";

import { expect, test, type Page } from "@playwright/test";

import { USERS, login } from "./helpers";

// Bộ nối Tin nhắn Facebook (Messenger) trên bản thật: kết nối, xác minh webhook, kiểm chữ ký, tin đến tạo lead và hội
// thoại, trả lời trong khung 24 giờ. Máy chủ Meta là bản giả chạy trong bài kiểm thử: chạy app với
// META_GRAPH_BASE=http://127.0.0.1:4010/v25.0 và E2E_GRAPH_MOCK=1, không thì bỏ qua cả nhóm.

const PAGE_ID = "104857300000001";
const APP_SECRET = "app-secret-thu-messenger";
const VERIFY = "ma-xac-minh-thu-9q";
const PSID = `77${Date.now() % 1_000_000_000}`;

test.describe.configure({ mode: "serial" });

let mock: http.Server | null = null;
const sent: { path: string; body: unknown }[] = [];
let meNeedsEngagement = false;

test.beforeAll(async () => {
  if (!process.env.E2E_GRAPH_MOCK) return;
  mock = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      const path = url.pathname.replace(/^\/v25\.0\//, "");
      const reply = (obj: unknown) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.method === "GET" && path === "me") {
        if (meNeedsEngagement) {
          // Token thiếu pages_read_engagement: Meta không cho đọc thông tin Page (mã 100).
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: { code: 100, message: "requires pages_read_engagement" } }));
        }
        return reply({ id: PAGE_ID, name: "Đại Việt Showroom Quận 4" });
      }
      if (req.method === "POST" && path.endsWith("/subscribed_apps")) return reply({ success: true });
      if (req.method === "POST" && path === "me/messages") {
        sent.push({ path, body: JSON.parse(raw) });
        return reply({ recipient_id: PSID, message_id: `m_out_${sent.length}_${PSID}` });
      }
      return reply({ first_name: "Mai", last_name: "Trần" });
    });
  });
  await new Promise<void>((ok, fail) => {
    mock!.once("error", fail);
    mock!.listen(4010, "127.0.0.1", () => ok());
  }).catch(() => {
    // Cổng đang có máy chủ giả khác (chạy thử bằng tay): dùng luôn.
    mock = null;
  });
});

test.afterAll(() => mock?.close());

test.beforeEach(async ({}, testInfo) => {
  test.skip(!process.env.E2E_GRAPH_MOCK, "Cần chạy app với META_GRAPH_BASE trỏ tới máy chủ Meta giả");
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
});

/** Gọi webhook từ trong trang (cùng địa chỉ) để không đi qua proxy của máy chạy kiểm thử. */
async function post(page: Page, body: unknown, secret = APP_SECRET) {
  const raw = JSON.stringify(body);
  const sig = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  await page.goto("/login");
  return page.evaluate(
    async ({ raw, sig }) =>
      (
        await fetch("/api/webhooks/meta", {
          method: "POST",
          headers: { "content-type": "application/json", "x-hub-signature-256": sig },
          body: raw,
        })
      ).status,
    { raw, sig },
  );
}

const inbound = (mid: string, text: string) => ({
  object: "page",
  entry: [
    {
      id: PAGE_ID,
      time: Date.now(),
      messaging: [
        { sender: { id: PSID }, recipient: { id: PAGE_ID }, timestamp: Date.now(), message: { mid, text } },
      ],
    },
  ],
});

test("Owner kết nối Messenger: token đúng Page thì chuyển sang Đã kết nối", async ({ page }) => {
  // Như Page thật: token có quyền nhắn tin nhưng không có pages_read_engagement, vẫn phải kết nối được.
  meNeedsEngagement = true;
  await login(page, USERS.owner);
  await page.goto("/settings/integrations");
  const row = page.getByRole("listitem", { name: "Tin nhắn Facebook" });
  await row
    .getByRole("button", { name: /Kết nối/ })
    .first()
    .click();
  const form = row.getByRole("form", { name: "Kết nối nhanh Tin nhắn Facebook" });
  await form.getByLabel(/App Secret/).fill(APP_SECRET);
  await form.getByLabel(/Page access token/).fill("page-token-thu");
  await form.getByLabel(/Mã xác minh webhook/).fill(VERIFY);
  await form.getByLabel("ID Page Facebook").fill(PAGE_ID);
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: /Lưu khóa/ }).click();
  await expect(page.getByRole("status")).toContainText("Tin nhắn Facebook đã kết nối");
  await page.reload();
  await expect(page.getByRole("listitem", { name: "Tin nhắn Facebook" })).toContainText("Đã kết nối");
  expect(await page.content()).not.toContain(APP_SECRET);
});

test("xác minh webhook: đúng mã trả challenge, sai mã bị từ chối", async ({ page }) => {
  await page.goto("/login");
  const get = (token: string) =>
    page.evaluate(async (token) => {
      const r = await fetch(
        `/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=4242`,
      );
      return `${r.status}:${await r.text()}`;
    }, token);
  expect(await get(VERIFY)).toBe("200:4242");
  expect((await get("sai")).startsWith("403")).toBe(true);
});

test("sai chữ ký thì không nhận tin", async ({ page }) => {
  expect(await post(page, inbound(`m.bad.${PSID}`, "x"), "secret-sai")).toBe(401);
});

test("tin đến tạo hội thoại; sale admin trả lời trong khung 24 giờ", async ({ page }) => {
  expect(await post(page, inbound(`m.1.${PSID}`, "Chào shop, ghế DV-X9 còn hàng không?"))).toBe(200);
  // Meta gửi lại cùng tin: vẫn 200, không nhân đôi.
  expect(await post(page, inbound(`m.1.${PSID}`, "Chào shop, ghế DV-X9 còn hàng không?"))).toBe(200);

  await login(page, USERS.saleAdmin);
  await page.goto("/inbox");
  const item = page
    .getByRole("list", { name: "Danh sách hội thoại" })
    .getByRole("button", { name: /Trần Mai/ });
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.click();
  const log = page.getByRole("log", { name: "Tin nhắn" });
  await expect(log.getByText("Chào shop, ghế DV-X9 còn hàng không?")).toHaveCount(1);
  await expect(page.getByText(/Khung 24 giờ còn 23 giờ/)).toBeVisible();

  await page.getByLabel("Nội dung trả lời").fill("Dạ còn ạ, chị ở tỉnh nào để em báo phí giao?");
  await page.getByRole("button", { name: "Gửi" }).click();
  await expect(log.getByText("Dạ còn ạ, chị ở tỉnh nào để em báo phí giao?")).toBeVisible();
  await expect(log.getByText("✓")).toBeVisible();
  if (mock) expect(sent.at(-1)?.body).toMatchObject({ recipient: { id: PSID }, messaging_type: "RESPONSE" });

  // Hồ sơ lead ghi tin nhắn trên dòng hoạt động, không lộ nội dung tin.
  await page.getByRole("link", { name: "Mở hồ sơ lead" }).click();
  await expect(page.getByText("Lead vào từ Tin nhắn Facebook").first()).toBeVisible();
  await expect(page.getByText("Trả lời khách qua Messenger").first()).toBeVisible();
});

test("tin mới hiện ngay trên màn đang mở, không cần tải lại trang (Realtime)", async ({ page, browser }) => {
  // Tin mở đầu riêng của lần chạy này để chọn đúng hội thoại (nhiều lần chạy cùng tên "Trần Mai").
  const opener = `Mở đầu ${PSID}`;
  expect(await post(page, inbound(`m.rt0.${PSID}`, opener))).toBe(200);
  await login(page, USERS.saleAdmin);
  await page.goto("/inbox");
  const item = page.getByRole("list", { name: "Danh sách hội thoại" }).getByRole("button", { name: opener });
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.click();
  const log = page.getByRole("log", { name: "Tin nhắn" });
  await expect(log.getByText(opener)).toBeVisible();
  await expect(page.locator("html[data-live-inbox=on]")).toHaveCount(1, { timeout: 15_000 });
  const other = await browser.newPage();
  expect(await post(other, inbound(`m.rt.${PSID}`, "Shop ơi còn đó không?"))).toBe(200);
  await other.close();
  // Hỏi định kỳ đã bỏ (5 phút mới hỏi lại): tin hiện được trong vài giây chỉ có thể nhờ Realtime.
  await expect(log.getByText("Shop ơi còn đó không?")).toBeVisible({ timeout: 15_000 });
});

test("ảnh khách gửi hiện trong khung chat; bấm Enter hai lần chỉ gửi một tin", async ({ page }) => {
  test.skip(!mock, "Cần máy chủ Meta giả của bài này để đếm số tin đã gửi");
  const opener = `Ảnh ${PSID}`;
  expect(await post(page, inbound(`m.img0.${PSID}`, opener))).toBe(200);
  const withImage = inbound(`m.img1.${PSID}`, "");
  const msg = withImage.entry[0].messaging[0].message as unknown as Record<string, unknown>;
  delete msg.text;
  msg.attachments = [{ type: "image", payload: { url: "https://example.com/ghe-dv-x9.jpg" } }];
  expect(await post(page, withImage)).toBe(200);

  await login(page, USERS.saleAdmin);
  await page.goto("/inbox");
  const item = page
    .getByRole("list", { name: "Danh sách hội thoại" })
    .getByRole("button", { name: /Trần Mai/ });
  await item.first().click();
  const log = page.getByRole("log", { name: "Tin nhắn" });
  // Máy chạy thử không ra được mạng: ảnh có thể không tải được, khi đó báo xem trên kênh gốc.
  await expect(
    log.getByRole("img", { name: "Ảnh khách gửi" }).or(log.getByText(/Ảnh đã hết hạn xem trên CRM/)),
  ).toBeVisible();

  const before = sent.length;
  const box = page.getByLabel("Nội dung trả lời");
  await box.fill(`Dạ em nhận ảnh rồi ${PSID}`);
  await box.press("Enter");
  await box.press("Enter");
  await expect(log.getByText(`Dạ em nhận ảnh rồi ${PSID}`)).toHaveCount(1);
  await expect.poll(() => sent.length).toBe(before + 1);
  await page.waitForTimeout(1500);
  expect(sent.length).toBe(before + 1);
});

test("cột phải: đổi tên khách, lưu số và địa chỉ khách nhắn, ghim ghi chú", async ({ page }) => {
  const opener = `Cột phải ${PSID}`;
  expect(await post(page, inbound(`m.side0.${PSID}`, opener))).toBe(200);
  // Khác đuôi với mã khách giả (PSID) để không lẫn với dãy số đó trong "Khách đã cho biết".
  const phoneDigits = `09${PSID.slice(-8).split("").reverse().join("")}`;
  expect(
    await post(
      page,
      inbound(
        `m.side1.${PSID}`,
        `Số em ${phoneDigits}, giao giúp em về 12 Lê Lợi, xã Diễn Kỷ, Diễn Châu, Nghệ An nhé`,
      ),
    ),
  ).toBe(200);

  await login(page, USERS.saleAdmin);
  await page.goto("/inbox");
  // Danh sách hiện tin mới nhất của hội thoại (tin có số và địa chỉ).
  await page
    .getByRole("list", { name: "Danh sách hội thoại" })
    .getByRole("button", { name: new RegExp(phoneDigits) })
    .click();
  const side = page.getByRole("complementary", { name: "Thông tin khách" });
  await expect(side).toBeVisible();

  // Đổi tên khách.
  // Giữ "Trần Mai" trong tên: bài sau tìm hội thoại theo tên này.
  const newName = `Trần Mai (Daegu ${PSID.slice(-4)})`;
  await side.getByRole("button", { name: "Sửa tên khách" }).click();
  await side.getByLabel("Tên khách").fill(newName);
  await side.getByRole("button", { name: "Lưu tên" }).click();
  await expect(side.getByText(newName)).toBeVisible();

  // Khách đã cho biết: lưu số (hiện dạng che) và địa chỉ.
  const facts = side.getByRole("list", { name: "Khách đã cho biết" });
  // Mã khách giả trong các tin thử cũng là dãy số dài: chọn đúng dòng có số khách vừa nhắn.
  await facts
    .getByRole("listitem")
    .filter({ hasText: phoneDigits.slice(-3) })
    .getByRole("button", { name: "Lưu số điện thoại vào hồ sơ" })
    .click();
  await expect(page.getByRole("status")).toContainText("Đã lưu số vào hồ sơ khách");
  await expect(side.getByText(`${phoneDigits.slice(-3)}`, { exact: false }).first()).toBeVisible();
  await facts.getByRole("button", { name: "Lưu địa chỉ vào hồ sơ" }).click();
  await expect(side.getByRole("list", { name: "Địa chỉ giao đã lưu" })).toContainText("Nghệ An");

  // Ghi chú ghim hiện ở đầu khung chat.
  await side.getByRole("tab", { name: /Ghi chú/ }).click();
  await side.getByLabel("Ghi chú về khách").fill("Khách muốn giao trước Tết, gọi sau 19h");
  await side.getByRole("button", { name: "Ghim ghi chú" }).click();
  await expect(page.getByLabel("Ghi chú ghim")).toContainText("Khách muốn giao trước Tết");
});

test("telesale không giữ lead thì không thấy hội thoại", async ({ page }) => {
  // Lead phân vòng tròn cho Thảo hoặc An (cả hai đang trực): đúng một người thấy.
  const seen: boolean[] = [];
  for (const who of [USERS.thao, USERS.an]) {
    await login(page, who);
    await page.goto("/inbox");
    // Chờ màn Hội thoại hiện xong (có khung chờ khi tải) rồi mới xem có hội thoại hay không.
    await expect(page.getByRole("heading", { name: "Hội thoại", level: 1 })).toBeAttached();
    seen.push(await page.getByRole("button", { name: /Trần Mai/ }).isVisible());
  }
  expect(seen.filter(Boolean).length).toBe(1);
});
