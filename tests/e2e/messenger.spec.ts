import { createHmac } from "node:crypto";
import http from "node:http";

import { expect, test, type Locator, type Page } from "@playwright/test";

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
// Hội thoại và tin Meta trả khi CRM đọc lại tin bị lỡ (bài "đọc lại tin bị lỡ").
let graphConversations: unknown[] = [];
// Ảnh đại diện Meta trả cho khách chính (PSID); khách khác không có ảnh công khai.
const AVATAR = "https://example.com/anh-dai-dien-tran-mai.jpg";
const graphMessages = new Map<string, unknown[]>();

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
      if (req.method === "GET" && url.searchParams.get("fields") === "profile_pic")
        return reply(path === PSID ? { profile_pic: AVATAR } : {});
      if (req.method === "GET" && path === `${PAGE_ID}/conversations` && !url.searchParams.get("user_id")) {
        if (meNeedsEngagement) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: { code: 10, message: "requires pages_read_engagement" } }));
        }
        return reply({ data: graphConversations, paging: {} });
      }
      const thread = path.match(/^(t_[a-z]+)\/messages$/)?.[1];
      if (req.method === "GET" && thread) return reply({ data: graphMessages.get(thread) ?? [] });
      // Khách thứ hai (người gửi PSID + "2") mang tên khác để không lẫn với "Trần Mai".
      if (path.startsWith(`${PSID}2`)) return reply({ first_name: "Hùng", last_name: "Lê" });
      // Khách chỉ có trong phần đọc lại tin bị lỡ (webhook không về).
      if (path.startsWith(`${PSID}3`)) return reply({ first_name: "Lan", last_name: "Phạm" });
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

const inbound = (mid: string, text: string, sender = PSID) => ({
  object: "page",
  entry: [
    {
      id: PAGE_ID,
      time: Date.now(),
      messaging: [
        { sender: { id: sender }, recipient: { id: PAGE_ID }, timestamp: Date.now(), message: { mid, text } },
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
  // Vẫn kết nối được, nhưng báo token thiếu quyền để đọc lại tin bị lỡ.
  await expect(page.getByRole("status")).toContainText(
    "chưa đọc lại được tin bị lỡ vì token thiếu quyền pages_read_engagement",
  );
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

  // Tin nhắn không tự thành lead (Owner chốt 12/10/2026): Sale admin thấy tiềm năng thì chuyển thành lead.
  await expect(page.getByText(/Khách đang hỏi/).first()).toBeVisible();
  await page.getByRole("button", { name: "Chuyển thành lead" }).click();
  await expect(page.getByRole("status")).toContainText("Đã chuyển thành lead");

  // Hồ sơ lead ghi việc chuyển thành lead trên dòng hoạt động, không lộ nội dung tin.
  await page.getByRole("link", { name: "Mở hồ sơ lead" }).click();
  await expect(page.getByText("Lead vào từ Tin nhắn Facebook").first()).toBeVisible();
  await expect(page.getByText("Chuyển từ hội thoại Messenger thành lead").first()).toBeVisible();
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

test("thẻ khách, lọc theo thẻ, giao nhân viên, đánh dấu xong", async ({ page }) => {
  await login(page, USERS.saleAdmin);
  await page.goto("/inbox");
  const list = page.getByRole("list", { name: "Danh sách hội thoại" });
  await list
    .getByRole("button", { name: /Trần Mai/ })
    .first()
    .click();
  const side = page.getByRole("complementary", { name: "Thông tin khách" });
  const tags = side.getByRole("group", { name: "Thẻ khách" });

  // Gắn thẻ có sẵn và tạo thẻ mới.
  await tags.getByRole("button", { name: "Hỏi giá" }).click();
  await expect(tags.getByRole("button", { name: "Hỏi giá" })).toHaveAttribute("aria-pressed", "true");
  const label = `Gọi tối ${PSID.slice(-4)}`;
  await side.getByLabel("Tạo thẻ mới").fill(label);
  await side.getByRole("button", { name: "Thêm thẻ" }).click();
  await expect(tags.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");

  // Lọc theo thẻ mới chỉ còn hội thoại này, mục danh sách hiện thẻ.
  await page.getByLabel("Lọc theo thẻ").selectOption({ label });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByRole("listitem").first()).toContainText(label);
  await page.getByLabel("Lọc theo thẻ").selectOption("");

  // Giao cho Thảo từ đầu hội thoại.
  await page.getByLabel("Nhân viên phụ trách").selectOption({ label: "Thảo" });
  await expect(page.getByRole("status")).toContainText(/Đã giao 1 lead cho Thảo|Không có lead nào cần đổi/);
  await expect(page.getByLabel("Nhân viên phụ trách")).toHaveValue("11111111-1111-4111-8111-000000000003");

  // Đánh dấu xong rồi mở lại.
  await page.getByRole("button", { name: "Đánh dấu xong" }).click();
  await expect(page.getByRole("button", { name: "Mở lại" })).toBeVisible();
  await page
    .getByRole("group", { name: "Lọc khách" })
    .getByRole("button", { name: /Đã xong/ })
    .click();
  await expect(list.getByRole("button", { name: /Trần Mai/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Mở lại" }).click();
  await expect(page.getByRole("button", { name: "Đánh dấu xong" })).toBeVisible();
});

/** Chọn sản phẩm ở dòng hàng theo mã SKU (nhãn có kèm giá). */
async function pick(form: Locator, line: number, sku: string) {
  const sel = form.getByLabel(`Sản phẩm dòng ${line}`);
  const value = await sel.locator("option", { hasText: sku }).first().getAttribute("value");
  await sel.selectOption(value!);
}

/** Giao tới địa chỉ mới (khách đã có địa chỉ lưu thì chọn "Địa chỉ mới…"). */
async function newAddress(form: Locator, province: string, street: string) {
  const saved = form.getByLabel("Địa chỉ giao");
  if (await saved.count()) await saved.selectOption("new");
  await form.getByLabel("Tỉnh giao").selectOption(province);
  await form.getByLabel("Số nhà, đường").fill(street);
}

test("lên đơn trong hội thoại: đủ bốn thông tin, giá theo bảng giá, giảm vượt mức chờ Owner duyệt", async ({
  page,
}) => {
  await login(page, USERS.saleAdmin);
  await page.goto("/inbox");
  await page
    .getByRole("list", { name: "Danh sách hội thoại" })
    .getByRole("button", { name: /Trần Mai/ })
    .first()
    .click();
  const side = page.getByRole("complementary", { name: "Thông tin khách" });

  // Form Lên đơn điền sẵn từ hồ sơ đúng khách đang mở; thiếu dịp, ngân sách thì báo, chưa tạo đơn.
  await side.getByRole("tab", { name: /Lên đơn/ }).click();
  const form = side.getByRole("form", { name: "Lên đơn" });
  await expect(form.getByLabel("Họ tên người đặt")).toHaveValue(/Trần Mai/);
  await form.getByRole("button", { name: "Tạo đơn" }).click();
  await expect(form.getByRole("list", { name: "Còn thiếu" })).toContainText("Chưa chọn dịp mua");

  // Điền ngay trên form: mua cho chính mình, dịp, ngân sách, địa chỉ mới; lưu vào hồ sơ khi tạo đơn.
  await form.getByLabel("Mua cho chính mình").check();
  await form.getByLabel("Dịp mua").selectOption({ index: 1 });
  await form.getByLabel("Ngân sách khách").selectOption({ index: 1 });
  await newAddress(form, "Nghệ An", "12 Lê Lợi");
  await pick(form, 1, "DC302");
  // Đơn trong giới hạn giảm: xác nhận luôn, tổng = 49.000.000 − 1.000.000 + 500.000.
  await form.getByLabel("Mức giảm").fill("1.000.000");
  await form.getByLabel("Phí giao").fill("500.000");
  await expect(form.getByLabel("Tạm tính")).toContainText("48.500.000");
  await expect(form.locator(".cv-total")).toContainText("48.500.000");
  await form.getByRole("button", { name: "Tạo đơn" }).click();
  await expect(page.getByRole("status")).toContainText(/Đã tạo đơn Q4-\d{4}-\d{4}/);
  const orders = side.getByRole("list", { name: "Đơn của khách" });
  await expect(orders).toContainText("48.500.000");
  await expect(orders).toContainText("Đã xác nhận");
  await side.getByRole("tab", { name: /Khách/ }).click();
  await expect(side.getByRole("form", { name: "Bốn thông tin bắt buộc" })).toContainText(
    "Đã đủ bốn thông tin",
  );
  await side.getByRole("tab", { name: /Lên đơn/ }).click();

  // Giảm 7% vượt mức 5% của sale admin: đơn chờ Owner duyệt.
  await pick(form, 1, "DC108");
  await form.getByLabel("Kiểu giảm").selectOption("pct");
  await form.getByLabel("Mức giảm").fill("7");
  await expect(form.getByRole("note")).toContainText("Cần Owner duyệt");
  await form.getByRole("button", { name: "Tạo đơn" }).click();
  await expect(page.getByRole("status")).toContainText("đang chờ Owner duyệt");
  await expect(orders).toContainText("Chờ duyệt giảm giá");

  // Owner duyệt ở hàng chờ duyệt.
  await login(page, USERS.owner);
  await page.goto("/tasks");
  const ap = page.getByLabel(/Duyệt giảm giá: Đơn Q4-.*Giảm tay 7/);
  await ap.getByRole("button", { name: "Duyệt" }).click();
  await expect(page.getByLabel(/Duyệt giảm giá: Đơn Q4-.*Giảm tay 7/)).toHaveCount(0);
});

test("báo giá: tạo ảnh đầy đủ thông tin để gửi khách, khách đồng ý thì nhân viên bấm sinh đơn", async ({
  page,
  browser,
}) => {
  await login(page, USERS.saleAdmin);
  await page.goto("/inbox");
  await page
    .getByRole("list", { name: "Danh sách hội thoại" })
    .getByRole("button", { name: /Trần Mai/ })
    .first()
    .click();
  const side = page.getByRole("complementary", { name: "Thông tin khách" });
  await side.getByRole("tab", { name: /Lên đơn/ }).click();
  const form = side.getByRole("form", { name: "Lên đơn" });
  await pick(form, 1, "DC203");
  await form.getByLabel("Phí giao").fill("300.000");
  await expect(form.getByLabel("Tạm tính")).toContainText("34.880.000");
  await form.getByRole("button", { name: "Ảnh báo giá" }).click();

  // Ảnh PNG hiện ngay để tải hoặc chép gửi khách; không còn link.
  const img = side.getByRole("img", { name: /^Ảnh báo giá BG-Q4-/ });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalHeight)).toBeGreaterThan(600);
  await expect(side.getByRole("link", { name: "Tải ảnh" })).toBeVisible();
  await expect(side.getByRole("button", { name: "Chép ảnh" })).toBeVisible();
  const src = await img.getAttribute("src");
  const res = await page.request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");

  // Người ngoài (chưa đăng nhập) không lấy được ảnh.
  const guest = await browser.newContext();
  const leaked = await guest.request.get(new URL(src!, page.url()).toString());
  expect(leaked.headers()["content-type"] ?? "").not.toContain("image/png");
  await guest.close();

  // Khách nhắn đồng ý: nhân viên bấm "Khách đã đồng ý" thì sinh đơn từ báo giá.
  const quotes = side.getByRole("list", { name: "Báo giá đã gửi" });
  await quotes.getByRole("button", { name: "Khách đã đồng ý" }).first().click();
  await expect(quotes).toContainText("Khách đã đồng ý");
  await quotes.getByRole("link", { name: "Mở đơn từ báo giá" }).first().click();
  await expect(page.getByRole("heading", { name: /^Đơn Q4-/ })).toBeVisible();
  await expect(page.locator("body")).toContainText("34.880.000");
});

test("chuyển hội thoại thì form Lên đơn điền lại đúng khách đang mở", async ({ page }) => {
  // Khách thứ hai nhắn tới (người gửi khác) để có hai hội thoại.
  expect(await post(page, inbound(`m.sw.${PSID}`, `Khách thứ hai ${PSID}`, `${PSID}2`))).toBe(200);
  await login(page, USERS.saleAdmin);
  await page.goto("/inbox");
  const buttons = page.getByRole("list", { name: "Danh sách hội thoại" }).getByRole("button");
  const side = page.getByRole("complementary", { name: "Thông tin khách" });
  const form = side.getByRole("form", { name: "Lên đơn" });
  const head = side.locator(".cv-info-top b").first();

  // Khách thứ hai vừa nhắn nên là khách đang hỏi: chưa lên đơn được cho tới khi chuyển thành lead.
  await buttons.nth(0).click();
  await side.getByRole("tab", { name: /Lên đơn/ }).click();
  await expect(side.getByText(/Khách đang hỏi, chưa phải lead/)).toBeVisible();
  await page.getByRole("button", { name: "Chuyển thành lead" }).click();
  await expect(page.getByRole("link", { name: "Mở hồ sơ lead" })).toBeVisible();
  const first = (await head.innerText()).trim();
  await side.getByRole("tab", { name: /Lên đơn/ }).click();
  await expect(form.getByLabel("Họ tên người đặt")).toHaveValue(first);
  await form.getByLabel("Ghi chú đơn").fill("ghi chú của khách trước");

  // Khách thứ hai: tab Lên đơn vẫn mở, mọi ô điền lại theo khách mới, không giữ chữ của khách trước.
  await buttons.nth(1).click();
  await expect(head).not.toHaveText(first);
  const second = (await head.innerText()).trim();
  await expect(side.getByRole("tab", { name: /Lên đơn/ })).toHaveAttribute("aria-selected", "true");
  await expect(form.getByLabel("Họ tên người đặt")).toHaveValue(second);
  await expect(form.getByLabel("Ghi chú đơn")).toHaveValue("");
});

test("đơn đi trọn: nhập kho, ghi cọc, xác nhận tiền, giữ hàng, thu khi giao, xuất kho serial, hoàn tất bảo hành", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const serial = `E2E-${PSID.slice(-6)}`;

  // Owner nhập 1 ghế DC302 kèm serial.
  await login(page, USERS.owner);
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Lập phiếu nhập" }).click();
  const doc = page.getByRole("form", { name: "Phiếu nhập" });
  await doc.getByLabel("SKU dòng 1").selectOption({ label: "Ghế massage Daikiosan DC302 (DC302)" });
  await doc.getByLabel("Serial dòng 1").fill(serial);
  await doc.getByRole("button", { name: "Lưu nháp" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lập phiếu nháp");
  const docs = page.getByRole("region", { name: "Phiếu kho" });
  await docs
    .getByRole("listitem")
    .filter({ hasText: serial })
    .getByRole("button", { name: "Ghi sổ" })
    .click();
  await expect(page.getByRole("status")).toContainText("Đã ghi sổ");

  // Sale admin (người bán) mở đơn 48.500.000 vừa tạo trong hội thoại, ghi cọc.
  await login(page, USERS.saleAdmin);
  await page.goto("/orders");
  await page
    .getByRole("row")
    .filter({ hasText: "48.500.000" })
    .filter({ hasText: "Chờ cọc" })
    .getByRole("link")
    .first()
    .click();
  await expect(page.getByRole("heading", { name: /^Đơn Q4-/ })).toBeVisible();
  const orderUrl = page.url();
  await expect(page.getByRole("list", { name: "Điều kiện chưa đạt" })).toContainText("Tiền cọc");
  await page.getByRole("button", { name: "Ghi thanh toán" }).click();
  const pay = page.getByRole("form", { name: "Ghi thanh toán đơn" });
  await expect(pay.getByLabel("Số tiền thanh toán")).toHaveValue("10.000.000");
  await pay.getByRole("button", { name: "Ghi nhận" }).click();
  await expect(page.getByRole("status")).toContainText("chờ người có quyền xác nhận");

  // Owner xác nhận tiền ở hàng chờ duyệt, duyệt thu khi giao.
  await login(page, USERS.owner);
  await page.goto("/tasks");
  await page
    .getByLabel(/Xác nhận tiền: Cọc 10\.000\.000 đồng cho đơn Q4-/)
    .getByRole("button", { name: "Duyệt" })
    .click();
  await expect(page.getByLabel(/Xác nhận tiền: Cọc 10\.000\.000 đồng/)).toHaveCount(0);
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Duyệt thu khi giao" }).click();
  await expect(page.getByText("Được thu khi giao")).toBeVisible();

  // Sale admin: đã cọc giữ hàng → sẵn sàng giao → xuất kho gán serial → giao → lắp → hoàn tất.
  await login(page, USERS.saleAdmin);
  await page.goto(orderUrl);
  const steps = page.getByRole("region", { name: "Thao tác đơn" });
  await steps.getByRole("button", { name: "Chuyển sang Đã cọc, giữ hàng" }).click();
  await expect(page.getByText(/Đang giữ 1 sản phẩm/)).toBeVisible();
  await steps.getByRole("button", { name: "Chuyển sang Sẵn sàng giao" }).click();
  const issue = page.getByRole("form", { name: "Xuất kho giao hàng" });
  await issue.getByLabel("Serial DC302").fill(serial);
  await issue.getByRole("button", { name: "Ghi sổ xuất kho, gán serial" }).click();
  await expect(page.getByRole("list", { name: "Sản phẩm của đơn" })).toContainText(`Serial ${serial}`);
  await steps.getByRole("button", { name: "Bắt đầu giao" }).click();
  await steps.getByRole("button", { name: "Xác nhận đã lắp" }).click();
  await steps.getByRole("button", { name: "Hoàn tất đơn" }).click();
  await expect(page.getByRole("region", { name: "Phiếu bảo hành" })).toContainText(serial);
  await expect(page.getByText("Đơn đã kết thúc.")).toBeVisible();
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

test("đọc lại tin bị lỡ: tin khách và trả lời trên hộp thư Facebook vào CRM, không nhân đôi", async ({
  page,
}) => {
  // Chạy app với CRON_SECRET giống E2E_CRON_SECRET để gọi thẳng route mà pg_cron gọi mỗi 2 phút.
  test.skip(!mock || !process.env.E2E_CRON_SECRET, "Cần máy chủ Meta giả của bài này và E2E_CRON_SECRET");
  const cron = process.env.E2E_CRON_SECRET ?? "";
  // Owner đã dán token mới có pages_read_engagement.
  meNeedsEngagement = false;
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "+0000");
  const missed = `${PSID}3`;
  const ask = `Cho em hỏi giá ghế ${PSID}`;
  const pageReply = `Dạ ghế DV-X9 giá 45 triệu ạ ${PSID}`;
  const inboxReply = `Dạ em gửi chị ảnh ghế ${PSID}`;
  graphConversations = [
    {
      id: "t_missed",
      updated_time: iso(now - 1000),
      participants: {
        data: [
          { id: missed, name: "Lan Phạm" },
          { id: PAGE_ID, name: "Đại Việt" },
        ],
      },
    },
    { id: "t_mai", updated_time: iso(now - 1500), participants: { data: [{ id: PSID }, { id: PAGE_ID }] } },
  ];
  // Meta trả tin mới trước. Khách mới chỉ có trên Facebook: webhook không về cả tin khách lẫn tin Page trả lời.
  graphMessages.set("t_missed", [
    { id: `m_page_${PSID}`, created_time: iso(now - 1000), from: { id: PAGE_ID }, message: pageReply },
    { id: `m_ask_${PSID}`, created_time: iso(now - 2000), from: { id: missed }, message: ask },
  ]);
  // Khách cũ: nhân viên gửi ảnh trên hộp thư Facebook; tin khách m.1 đã về qua webhook thì không thêm lần nữa.
  graphMessages.set("t_mai", [
    {
      id: `m_inbox_${PSID}`,
      created_time: iso(now - 1500),
      from: { id: PAGE_ID },
      message: inboxReply,
      attachments: {
        data: [{ mime_type: "image/jpeg", image_data: { url: "https://example.com/anh-ghe.jpg" } }],
      },
    },
    {
      id: `m.1.${PSID}`,
      created_time: iso(now - 1800),
      from: { id: PSID },
      message: "Chào shop, ghế DV-X9 còn hàng không?",
    },
  ]);

  await page.goto("/login");
  const call = (token: string) =>
    page.evaluate(async (token) => {
      const r = await fetch("/api/cron/messenger-reconcile", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      return { status: r.status, body: r.ok ? await r.json() : null };
    }, token);
  expect((await call("ma-sai-0123456789abcdef")).status).toBe(401);
  const first = await call(cron);
  expect(first.status).toBe(200);
  expect(first.body.runs[0]).toMatchObject({ conversations: 2, added: 3, byContent: 0 });
  // Cùng lượt đó lấy ảnh đại diện: chỉ khách chính có ảnh công khai.
  expect(first.body.runs[0].avatars).toMatchObject({ found: 1 });
  expect(first.body.runs[0].avatars.checked).toBeGreaterThanOrEqual(3);
  // Lượt gọi dồn ngay sau đó bị bỏ, không đọc chồng.
  expect((await call(cron)).body.runs[0]).toMatchObject({ skipped: "too_soon" });

  await login(page, USERS.saleAdmin);
  await page.goto("/inbox");
  const list = page.getByRole("list", { name: "Danh sách hội thoại" });
  await list
    .getByRole("button", { name: /Phạm Lan/ })
    .first()
    .click();
  const log = page.getByRole("log", { name: "Tin nhắn" });
  await expect(log.getByText(ask)).toHaveCount(1);
  await expect(log.getByText(pageReply)).toHaveCount(1);

  // Tin cuối của hội thoại có thể là tin bài khác vừa gửi: chọn theo tên khách.
  await list
    .getByRole("button", { name: /Trần Mai/ })
    .first()
    .click();
  await expect(log.getByText(inboxReply)).toHaveCount(1);
  // Ảnh nhân viên gửi trên hộp thư Facebook nằm trong đúng tin đó (ảnh thật hoặc dòng báo ảnh hết hạn).
  await expect(log.locator(".tg-row.is-out", { hasText: inboxReply }).locator(".cv-media")).toHaveCount(1);
  await expect(log.getByText("Chào shop, ghế DV-X9 còn hàng không?")).toHaveCount(1);
  // Trang Hội thoại nhận link ảnh đại diện (máy chạy thử không ra mạng nên ảnh có thể về chữ cái đầu khi tải lỗi).
  expect(await page.content()).toContain(AVATAR);
});
