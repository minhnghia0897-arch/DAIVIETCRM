import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Landing page chạy trên CRM (Marketing → Landing page): Owner tạo trang, chọn ghế hiện trên trang; khách chưa đăng nhập
// mở /lp/<đường dẫn> thấy ghế và giá lấy từ CRM, gửi form là thành lead nguồn Landing page; máy điền ô bẫy không tạo
// lead; gửi dồn từ một địa chỉ bị chặn; tắt trang thì khách không xem được.

test.describe.configure({ mode: "serial" });

const STAMP = Date.now() % 1_000_000;
const TITLE = `Khai trương thử ${STAMP}`;
const SLUG = `khai-truong-thu-${STAMP}`;
const CUSTOMER = `Khách Landing ${STAMP}`;
const PHONE = `0912${String(STAMP).padStart(6, "0")}`;
const GIFT_SKU = `QT${STAMP}`;
// Ảnh PNG 1×1 điểm ảnh: đủ để thử tải logo, ảnh đầu trang, ảnh quà.
const PNG = {
  name: "anh.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  ),
};

test("Owner tạo landing page, bật ghế; khách gửi form thành lead nguồn Landing page", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Tạo trang, lead: chạy một cỡ màn");
  await login(page, USERS.owner);
  // Một quà trong danh mục Quà tặng để thử tải ảnh quà cho landing.
  await page.goto("/gifts");
  await page.getByRole("button", { name: "Thêm quà" }).click();
  const giftForm = page.getByRole("form", { name: "Thêm quà" });
  await giftForm.getByLabel("Tên quà").fill(`Quạt thử ${STAMP}`);
  await giftForm.getByLabel("Mã quà").fill(GIFT_SKU);
  await giftForm.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByRole("region", { name: "Danh sách quà tặng" })).toContainText(GIFT_SKU);

  await page.goto("/landing-pages");
  await expect(page.getByRole("heading", { name: "Landing page", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Tạo landing page" }).click();
  const form = page.getByRole("form", { name: "Tạo landing page" });
  await form.getByLabel("Tên trang").fill(TITLE);
  await expect(form.getByLabel("Đường dẫn")).toHaveValue(SLUG);
  await form.getByLabel("Hotline").fill("0909 111 222");
  await form.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByRole("status")).toContainText(`Đã tạo ${TITLE}`);
  const item = page.getByRole("listitem", { name: `Landing page ${TITLE}` });
  await expect(item).toContainText("Đang chạy");
  await expect(item).toContainText(`/lp/${SLUG}`);
  await expect(item).toContainText("mẫu khai trương có sẵn");

  // Bật ghế DC302 trên trang, gắn nhãn.
  const row = page.getByRole("row", { name: "Ghế DC302" });
  await row.getByLabel("Hiện DC302 trên landing").check();
  await row.getByLabel("Nhãn DC302").fill("BÁN CHẠY");
  await row.getByLabel("Mô tả ngắn DC302").fill("Con lăn 4D, túi khí toàn thân");
  await row.getByRole("button", { name: "Lưu DC302" }).click();
  await expect(page.getByRole("status")).toContainText("ghế này hiện trên landing");

  // Ảnh chụp điện thoại nặng vài MB (quá 1MB mặc định của server action): trình duyệt thu nhỏ rồi mới gửi lên.
  const bytes = await row.getByLabel("Ảnh DC302").evaluate(async (input: HTMLInputElement) => {
    const c = document.createElement("canvas");
    c.width = 3000;
    c.height = 2250;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const x = (i / 4) % c.width;
      img.data[i] = (x / c.width) * 200 + Math.random() * 40;
      img.data[i + 1] = 120 + Math.random() * 40;
      img.data[i + 2] = 90 + Math.random() * 40;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise<Blob>((done) => c.toBlob((b) => done(b!), "image/jpeg", 0.95));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "ghe-dc302.jpg", { type: "image/jpeg" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return blob.size;
  });
  expect(bytes).toBeGreaterThan(1_500_000);
  await expect(page.getByRole("status")).toContainText("Đã tải ảnh lên");
  await expect(row.locator("img")).toHaveAttribute("src", /product-images/);

  // Logo, ảnh đầu trang riêng cho máy tính và điện thoại, ảnh quà trong danh mục Quà tặng.
  const pics = item.getByRole("group", { name: `Ảnh của ${TITLE}` }).locator("img");
  await item.getByLabel(`Logo cho ${TITLE}`).setInputFiles(PNG);
  await expect(pics).toHaveCount(1);
  await item.getByLabel(`Banner máy tính cho ${TITLE}`).setInputFiles(PNG);
  await expect(pics).toHaveCount(2);
  await item.getByLabel(`Banner điện thoại cho ${TITLE}`).setInputFiles(PNG);
  await expect(pics).toHaveCount(3);
  const giftRow = page.getByRole("row", { name: `Quà ${GIFT_SKU}` });
  await giftRow.getByLabel(`Ảnh quà ${GIFT_SKU}`).setInputFiles(PNG);
  await expect(giftRow.locator("img")).toHaveAttribute("src", /product-images/);

  // Khách chưa đăng nhập mở trang: ghế, giá từ bảng giá CRM, hotline của trang.
  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  const res = await guest.goto(`/lp/${SLUG}`);
  expect(res?.headers()["content-security-policy"]).toContain("sandbox");
  const grid = guest.locator("#grid");
  await expect(grid).toContainText("Ghế massage Daikiosan DC302");
  await expect(grid).toContainText("49.000.000đ");
  await expect(grid).toContainText("BÁN CHẠY");
  await expect(grid).toContainText("Con lăn 4D");
  await expect(grid.locator("img.real")).toHaveAttribute("src", /product-images/);
  await expect(guest.locator("#hot-top")).toHaveText("📞 0909 111 222");
  await expect(guest.locator("#brand img")).toHaveAttribute("src", /\/logo\//);
  await expect(guest.locator("#hero-img")).toHaveAttribute("src", /\/banner\//);
  await expect(guest.locator("#hero-src-m")).toHaveAttribute("srcset", /\/banner_mobile\//);
  await expect(
    guest.locator("#gift-list .gift", { hasText: `Quạt thử ${STAMP}` }).locator("img"),
  ).toHaveAttribute("src", /product-images/);

  await guest.getByLabel("Họ và tên *").fill(CUSTOMER);
  await guest.getByLabel("Số điện thoại / Zalo *").fill(PHONE);
  await guest.getByLabel("Mẫu ghế quan tâm").selectOption("DC302");
  await guest.getByLabel("Tôi đồng ý nhận tin ưu đãi").check();
  await guest.getByRole("button", { name: "Gửi thông tin" }).click();
  await expect(guest.locator("#ok")).toContainText("Đã nhận thông tin");
  await ctx.close();

  // Lead vào CRM đúng nguồn, có ghi chú mẫu quan tâm; số lead hiện trên màn Landing page.
  await page.goto(`/leads?q=${encodeURIComponent(CUSTOMER)}`);
  await page.getByRole("link", { name: CUSTOMER }).first().click();
  await expect(page.getByText("Nguồn: Landing page")).toBeVisible();
  await expect(page.getByText(/Mẫu quan tâm: DC302/).first()).toBeVisible();
  await page.goto("/landing-pages");
  await expect(item).toContainText("Tổng: 1");
});

test("ô bẫy không tạo lead, gửi dồn bị chặn, tắt trang thì khách không xem được", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Dùng trang của bài trên");
  const url = `/api/lp/${SLUG}/lead`;
  const bot = { name: "Máy dò", phone: "0987654321", website: "http://spam.example" };
  // Lượt gửi thật ở bài trên đã tính một lần; thêm bốn lượt máy là đủ năm lượt trong 10 phút.
  for (let i = 0; i < 4; i++) {
    const r = await request.post(url, { data: bot });
    expect(r.status()).toBe(200);
    expect((await r.json()).ok).toBe(true);
  }
  const blocked = await request.post(url, { data: { name: "Người thật", phone: "0987654322" } });
  expect(blocked.status()).toBe(429);

  await login(page, USERS.owner);
  await page.goto(`/leads?q=${encodeURIComponent("Máy dò")}`);
  await expect(page.getByRole("link", { name: "Máy dò" })).toHaveCount(0);

  await page.goto("/landing-pages");
  const item = page.getByRole("listitem", { name: `Landing page ${TITLE}` });
  // Gỡ logo: trang quay về chữ thương hiệu.
  await item.getByRole("button", { name: `Gỡ: Logo cho ${TITLE}` }).click();
  await expect(item.getByRole("group", { name: `Ảnh của ${TITLE}` }).locator("img")).toHaveCount(2);
  await item.getByRole("button", { name: "Tắt trang" }).click();
  await expect(item).toContainText("Đang tắt");
  // Người quản lý vẫn xem trước được; khách thì không.
  expect((await page.request.get(`/lp/${SLUG}`)).status()).toBe(200);
  const anon = await request.get(`/lp/${SLUG}`);
  expect(anon.status()).toBe(404);
});

test("telesale không vào được Landing page", async ({ page }) => {
  await login(page, USERS.thao);
  await page.goto("/landing-pages");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});
