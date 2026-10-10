import { expect, test, type Page } from "@playwright/test";

import { USERS, login } from "./helpers";

// Phòng Marketing (migration 20261010000100_marketing.sql): vai trò Marketing chỉ thấy số tổng hợp, tạo chiến dịch
// và xin ngân sách; Owner duyệt ngân sách ở Việc cần làm. Ghi vào database nên chạy một cỡ màn, sau `pnpm db:reset`.

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
});

const NAME = `Ghế massage thử ${String(Date.now()).slice(-5)}`;

/** Marketing không có trang chủ lead: đăng nhập xong vào thẳng Tổng quan Marketing. */
async function loginMarketing(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USERS.marketing);
  await page.getByLabel("Mật khẩu").fill("matkhau-dev-123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/marketing$/);
}

test("Marketing vào thẳng Tổng quan, thấy số theo chiến dịch, không vào được lead", async ({ page }) => {
  await loginMarketing(page);
  await expect(page.getByRole("heading", { name: "Tổng quan", exact: true })).toBeVisible();
  const byCampaign = page.getByRole("region", { name: "Theo chiến dịch" });
  await expect(byCampaign).toContainText("Ghế massage cho bố mẹ, người Việt tại Hàn");
  await expect(page.getByRole("region", { name: "Theo nguồn lead" })).toContainText(
    "Form quảng cáo Facebook",
  );
  // Không có tên khách hay số điện thoại nào trên màn.
  expect(await page.content()).not.toContain("Nguyễn Thị Thu");
  await expect(page.getByRole("navigation", { name: "Marketing" }).getByRole("link")).toHaveText([
    "Tổng quan",
    "Chiến dịch",
    "Lịch nội dung",
    "Kênh & nội dung",
    "KOL, KOC",
  ]);
  await page.goto("/leads");
  await expect(page.getByRole("heading", { name: "Chưa được cấp quyền" })).toBeVisible();
});

test("Marketing tạo chiến dịch, xin ngân sách; chưa duyệt thì chưa chạy", async ({ page }) => {
  await loginMarketing(page);
  await page.goto("/campaigns");
  await page.getByRole("button", { name: "Tạo chiến dịch" }).click();
  const form = page.getByRole("region", { name: "Chiến dịch mới" });
  await form.getByLabel("Tên chiến dịch").fill(NAME);
  await form.getByLabel("Thị trường khách").selectOption("VN");
  await form.getByLabel("Ngân sách xin duyệt").fill("20tr");
  await form.getByRole("button", { name: "Tạo chiến dịch" }).click();
  await expect(page.getByRole("status")).toContainText(`Đã tạo ${NAME}`);
  const item = page.getByRole("listitem", { name: NAME });
  await expect(item).toContainText("Chờ duyệt ngân sách");
  await expect(item).toContainText("Chờ Owner duyệt: 20.000.000 đ");

  await item.getByLabel("Chi phí ngày đó").fill("1.200.000");
  await item.getByRole("button", { name: "Ghi chi phí" }).click();
  await expect(page.getByRole("status")).toContainText("Đã ghi chi phí");
  await expect(item).toContainText("Đã chi: 1.200.000 đ");
});

test("Owner duyệt ngân sách ở Việc cần làm, chiến dịch chuyển sang Đang chạy", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/tasks");
  const req = page.getByLabel(new RegExp(`Duyệt ngân sách chiến dịch: .*${NAME}`));
  await expect(req.getByText("Lan Marketing đề xuất")).toBeVisible();
  await req.getByRole("button", { name: "Duyệt" }).click();
  await expect(page.getByRole("status")).toContainText("Đã duyệt");
  await page.goto("/campaigns");
  const item = page.getByRole("listitem", { name: NAME });
  await expect(item).toContainText("Đang chạy");
  await expect(item).toContainText("Ngân sách đã duyệt: 20.000.000 đ");
  await expect(item).toContainText("6% ngân sách");
});

test("sale admin xem được Marketing nhưng không sửa", async ({ page }) => {
  await login(page, USERS.saleAdmin);
  await page.goto("/campaigns");
  await expect(page.getByRole("heading", { name: "Chiến dịch", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo chiến dịch" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ghi chi phí" })).toHaveCount(0);
});
