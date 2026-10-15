import { expect, test, type Browser } from "@playwright/test";

import { USERS, login } from "./helpers";

// Mời người dùng bằng link (không cần SMTP): Owner nhập họ tên, email, vị trí; CRM tạo tài khoản đúng vai trò và
// đưa link một lần. Người được mời mở link, đặt mật khẩu, vào thẳng CRM với quyền của vai trò đó. Owner tạo được
// link đặt lại mật khẩu cho người quên mật khẩu.

test.describe.configure({ mode: "serial" });

const STAMP = Date.now() % 1_000_000_000;
const NAME = `Telesale Mới ${STAMP}`;
const EMAIL = `moi${STAMP}@example.test`;

async function openLinkAndSetPassword(browser: Browser, link: string, password: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Đặt mật khẩu" })).toBeVisible();
  await page.getByLabel("Mật khẩu mới (ít nhất 10 ký tự)").fill(password);
  await page.getByLabel("Nhập lại mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đặt mật khẩu" }).click();
  await expect(page).toHaveURL(/\/home$/);
  return { ctx, page };
}

test("Owner mời telesale bằng link; người mới đặt mật khẩu, vào đúng vai trò", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Tạo tài khoản: chạy một cỡ màn");
  await login(page, USERS.owner);
  await page.goto("/settings/users");
  await page.getByLabel("Họ tên").fill(NAME);
  await page.getByLabel("Email đăng nhập").fill(EMAIL);
  await page.getByLabel("Vai trò", { exact: true }).selectOption({ label: "Telesale" });
  await expect(page.getByText(/tự nhận lead khi bật Trực/)).toBeVisible();
  await page.getByRole("button", { name: "Tạo link mời" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `Đã tạo tài khoản ${NAME} (Telesale)` })).toBeVisible();
  const link = await dialog.getByLabel("Link vào CRM").inputValue();
  expect(link).toMatch(/\/auth\/confirm\?token_hash=[^&]+&type=invite&next=\/invite$/);
  await dialog.getByRole("button", { name: "Đóng" }).click();

  // Chưa mở link: dòng người mới ghi Chưa vào CRM, có email đăng nhập.
  const row = page.getByRole("row").filter({ hasText: NAME });
  await expect(row).toContainText("Chưa vào CRM");
  await expect(row).toContainText(EMAIL);

  // Mời trùng email thì báo rõ, không tạo thêm tài khoản.
  await page.getByLabel("Họ tên").fill(NAME);
  await page.getByLabel("Email đăng nhập").fill(EMAIL);
  await page.getByRole("button", { name: "Tạo link mời" }).click();
  await expect(page.getByRole("status")).toContainText("Email này đã có tài khoản");

  // Người mới mở link, đặt mật khẩu: vào Trang chủ của telesale, không vào được Cài đặt người dùng.
  const { ctx, page: newbie } = await openLinkAndSetPassword(browser, link, "matkhau-moi-12345");
  await expect(newbie.getByRole("heading", { name: "Việc của tôi hôm nay" })).toBeVisible();
  await newbie.goto("/settings/users");
  await expect(newbie.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
  // Link đã dùng thì không dùng lại được.
  const again = await browser.newContext();
  const reused = await again.newPage();
  await reused.goto(link);
  await expect(reused).toHaveURL(/\/login\?error=link/);
  await again.close();
  await ctx.close();

  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: NAME })).toContainText("Đang hoạt động");
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
