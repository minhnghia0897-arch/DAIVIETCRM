import { expect, test, type Browser, type Page } from "@playwright/test";

import { USERS, login } from "./helpers";

// Mời người dùng bằng link theo vị trí (Owner chốt 19/10/2026): Owner chỉ chọn vị trí và tạo link; người được mời
// mở link, tự nhập họ tên, email, mật khẩu để tạo tài khoản của mình và vào làm ngay với quyền của vị trí đó. Link
// dùng một lần, hủy được. Owner tạo được link đặt lại mật khẩu cho người quên mật khẩu.

test.describe.configure({ mode: "serial" });

const STAMP = Date.now() % 1_000_000_000;
const NAME = `Telesale Mới ${STAMP}`;
const EMAIL = `moi${STAMP}@example.test`;
const NOTE = `Chị Hoa ${STAMP}`;

async function openLinkAndSetPassword(browser: Browser, link: string, password: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Đặt mật khẩu" })).toBeVisible();
  // Ghi rõ đang đặt mật khẩu cho tài khoản nào.
  await expect(page.getByText(NAME)).toBeVisible();
  await page.getByLabel("Mật khẩu mới (ít nhất 10 ký tự)").fill(password);
  await page.getByLabel("Nhập lại mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đặt mật khẩu" }).click();
  await expect(page).toHaveURL(/\/home$/);
  return { ctx, page };
}

/** Owner chọn vị trí, ghi chú gửi cho ai, bấm Tạo link mời; trả link trong hộp vừa hiện. */
async function createInvite(page: Page, role: string, note: string) {
  await page.goto("/settings/users");
  await page.getByLabel("Vai trò", { exact: true }).selectOption({ label: role });
  await page.getByLabel("Gửi cho ai").fill(note);
  await page.getByRole("button", { name: "Tạo link mời" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `Đã tạo link mời vị trí ${role}` })).toBeVisible();
  const link = await dialog.getByLabel("Link vào CRM").inputValue();
  expect(link).toMatch(/\/join\/[A-Za-z0-9_-]{43}$/);
  await dialog.getByRole("button", { name: "Đóng" }).click();
  return link;
}

async function fillJoin(page: Page, name: string, email: string, password: string) {
  await page.getByLabel("Họ tên").fill(name);
  await page.getByLabel("Email (dùng để đăng nhập)").fill(email);
  await page.getByLabel("Mật khẩu (ít nhất 10 ký tự)").fill(password);
  await page.getByLabel("Nhập lại mật khẩu").fill(password);
  await page.getByRole("button", { name: "Tạo tài khoản và vào CRM" }).click();
}

test("Owner tạo link mời theo vị trí; người mới tự tạo tài khoản, vào đúng vai trò", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Tạo tài khoản: chạy một cỡ màn");
  await login(page, USERS.owner);
  await page.goto("/settings/users");
  await page.getByLabel("Vai trò", { exact: true }).selectOption({ label: "Telesale" });
  await expect(page.getByText(/tự nhận lead khi bật Trực/)).toBeVisible();
  const link = await createInvite(page, "Telesale", NOTE);
  const waiting = page.getByRole("group", { name: "Link mời chưa dùng" });
  await expect(waiting).toContainText(`Telesale · ${NOTE}`);

  // Owner lỡ mở link trên máy mình: không dùng tài khoản Owner, không làm tốn link.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Đang đăng nhập tài khoản khác" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng xuất để tạo tài khoản mới" })).toBeVisible();

  // Người mới mở link trên máy của họ, tự nhập thông tin: vào Trang chủ telesale, không vào được Cài đặt người dùng.
  const ctx = await browser.newContext();
  const newbie = await ctx.newPage();
  await newbie.goto(link);
  await expect(newbie.getByRole("heading", { name: "Tạo tài khoản" })).toBeVisible();
  await expect(newbie.getByText(/vị trí\s+Telesale/)).toBeVisible();
  await fillJoin(newbie, NAME, EMAIL, "matkhau-moi-12345");
  await expect(newbie).toHaveURL(/\/home$/);
  await expect(newbie.getByRole("heading", { name: "Việc của tôi hôm nay" })).toBeVisible();
  await newbie.goto("/settings/users");
  await expect(newbie.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
  // Link đã dùng thì không dùng lại được.
  const again = await browser.newContext();
  const reused = await again.newPage();
  await reused.goto(link);
  await expect(reused.getByRole("heading", { name: "Link mời không còn dùng được" })).toBeVisible();
  await again.close();
  await ctx.close();

  // Owner thấy người mới đúng vai trò, đang hoạt động, có email họ tự nhập; link đã dùng rời khỏi danh sách chờ.
  await page.goto("/settings/users");
  const row = page.getByRole("row").filter({ hasText: NAME });
  await expect(row).toContainText("Đang hoạt động");
  await expect(row).toContainText(EMAIL);
  await expect(row.getByLabel(`Vai trò của ${NAME}`).locator("option:checked")).toHaveText("Telesale");
  await expect(page.getByText(NOTE)).toHaveCount(0);
});

test("email đã có tài khoản thì báo rõ, link vẫn dùng được cho người khác", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Tạo tài khoản: chạy một cỡ màn");
  await login(page, USERS.owner);
  const link = await createInvite(page, "Telesale", `Trùng ${STAMP}`);
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(link);
  await fillJoin(p, "Người Trùng", EMAIL, "matkhau-trung-12345");
  await expect(p.getByText(/^Email này đã có tài khoản/)).toBeVisible();
  await p.goto(link);
  await expect(p.getByRole("heading", { name: "Tạo tài khoản" })).toBeVisible();
  await ctx.close();
});

test("Owner hủy link mời chưa dùng thì link không tạo được tài khoản", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Tạo tài khoản: chạy một cỡ màn");
  await login(page, USERS.owner);
  const note = `Hủy ${STAMP}`;
  const link = await createInvite(page, "Sale admin", note);
  await page.getByRole("button", { name: `Hủy link mời Sale admin ${note}` }).click();
  await expect(page.getByRole("status")).toContainText("Đã hủy link mời");
  await expect(page.getByText(note)).toHaveCount(0);
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(link);
  await expect(p.getByRole("heading", { name: "Link mời không còn dùng được" })).toBeVisible();
  await ctx.close();
});

test("thiết bị đang đăng nhập tài khoản khác: đăng xuất rồi mới tạo tài khoản", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Tạo tài khoản: chạy một cỡ màn");
  await login(page, USERS.owner);
  const link = await createInvite(page, "Telesale", `Máy chung ${STAMP}`);
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await login(p, USERS.thao);
  await p.goto(link);
  await expect(p.getByRole("heading", { name: "Đang đăng nhập tài khoản khác" })).toBeVisible();
  await p.getByRole("button", { name: "Đăng xuất để tạo tài khoản mới" }).click();
  await expect(p.getByRole("heading", { name: "Tạo tài khoản" })).toBeVisible();
  await ctx.close();
});

test("Owner tạo link đặt lại mật khẩu cho người quên mật khẩu", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Đổi mật khẩu: chạy một cỡ màn");
  await login(page, USERS.owner);
  await page.goto("/settings/users");
  await page
    .getByRole("row")
    .filter({ hasText: NAME })
    .getByRole("button", { name: "Tạo link vào CRM" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: `Đã tạo link đặt lại mật khẩu cho ${NAME}` }),
  ).toBeVisible();
  const link = await dialog.getByLabel("Link vào CRM").inputValue();
  expect(link).toContain("type=recovery");

  const { ctx } = await openLinkAndSetPassword(browser, link, "matkhau-khac-67890");
  await ctx.close();

  // Mật khẩu mới dùng được để đăng nhập.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Mật khẩu").fill("matkhau-khac-67890");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("sale admin không mời được người dùng", async ({ page }) => {
  await login(page, USERS.saleAdmin);
  await page.goto("/settings/users");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});
