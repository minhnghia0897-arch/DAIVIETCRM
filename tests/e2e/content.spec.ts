import { expect, test, type Page } from "@playwright/test";

import { USERS, login } from "./helpers";

// Lịch nội dung dạng Kanban (migration 20261010000200_content_calendar.sql): thêm bài, chuyển cột bằng nút và kéo
// thả, luật lên lịch (giờ đăng, kiểm nội dung), lịch tuần; sale admin chỉ xem. Ghi database: một cỡ màn.

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
});

const TITLE = `Video thử ${String(Date.now()).slice(-5)}`;

async function loginMarketing(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USERS.marketing);
  await page.getByLabel("Mật khẩu").fill("matkhau-dev-123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/marketing$/);
}

const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("Marketing thêm bài, chuyển cột; lên lịch bị chặn khi thiếu giờ đăng và kiểm nội dung", async ({
  page,
}) => {
  await loginMarketing(page);
  await page
    .getByRole("navigation", { name: "Marketing" })
    .getByRole("link", { name: "Lịch nội dung" })
    .click();
  await expect(page.getByRole("heading", { name: "Lịch nội dung", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Thêm bài" }).click();
  const form = page.getByRole("region", { name: "Bài mới" });
  await form.getByLabel("Tiêu đề").fill(TITLE);
  await form.getByLabel("Kênh").selectOption("tiktok");
  await form.getByRole("button", { name: "Thêm bài" }).click();
  await expect(page.getByRole("status")).toContainText(`Đã thêm ${TITLE}`);
  const card = page.getByRole("listitem", { name: TITLE });
  await expect(column(page, "Ý tưởng").getByRole("listitem", { name: TITLE })).toBeVisible();

  // Kéo thả sang Viết kịch bản.
  await card.dragTo(column(page, "Viết kịch bản"));
  await expect(column(page, "Viết kịch bản").getByRole("listitem", { name: TITLE })).toBeVisible();

  await card.getByLabel(`Chuyển ${TITLE} sang`).selectOption("review");
  await expect(column(page, "Chờ duyệt").getByRole("listitem", { name: TITLE })).toContainText(
    "Chưa kiểm nội dung",
  );

  // Lên lịch khi chưa có giờ đăng: báo lỗi, mở bài để bổ sung.
  await card.getByLabel(`Chuyển ${TITLE} sang`).selectOption("scheduled");
  await expect(page.getByRole("status")).toContainText("Cần ngày giờ đăng");
  const edit = page.getByRole("region", { name: `Bài ${TITLE}` });
  await edit.getByLabel("Ngày giờ đăng (giờ VN)").fill("2026-12-01T19:00");
  await edit.getByLabel(/Không hứa chữa bệnh/).check();
  await edit.getByLabel(/đã được khách đồng ý/).check();
  await edit.getByLabel("Cột").selectOption("scheduled");
  await edit.getByRole("button", { name: "Lưu bài" }).click();
  await expect(page.getByRole("status")).toContainText(`Đã lưu ${TITLE}`);
  await expect(column(page, "Đã lên lịch").getByRole("listitem", { name: TITLE })).toContainText(
    "01/12 19:00",
  );

  // Đã đăng cần link bài.
  await card.getByLabel(`Chuyển ${TITLE} sang`).selectOption("published");
  await expect(page.getByRole("status")).toContainText("Cần link bài đã đăng");
});

test("lịch tuần hiện bài theo ngày đăng (giờ VN)", async ({ page }) => {
  await loginMarketing(page);
  await page.goto("/content");
  await page.getByRole("button", { name: "Lịch tuần" }).click();
  const week = page.getByRole("region", { name: "Lịch tuần" });
  // Lùi tới tuần có Thứ Ba 01/12/2026, ngày đăng của bài vừa lên lịch ở bài trước.
  const monday = (d: Date) => {
    const vn = new Date(d.getTime() + 7 * 3_600_000);
    return Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() - ((vn.getUTCDay() + 6) % 7));
  };
  const weeks = Math.round(
    (monday(new Date("2026-12-01T05:00:00Z")) - monday(new Date())) / (7 * 86_400_000),
  );
  for (let i = 0; i < weeks; i++) await week.getByRole("button", { name: "Tuần sau" }).click();
  await expect(week.getByRole("heading")).toContainText("30/11");
  const tuesday = week.getByRole("group", { name: "T3 01/12" });
  await expect(tuesday.getByRole("button", { name: new RegExp(TITLE) })).toContainText("19:00");
});

test("sale admin xem lịch nội dung nhưng không sửa", async ({ page }) => {
  await login(page, USERS.saleAdmin);
  await page.goto("/content");
  await expect(page.getByRole("heading", { name: "Lịch nội dung", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm bài" })).toHaveCount(0);
  await expect(page.getByLabel(/^Chuyển .* sang$/)).toHaveCount(0);
});
