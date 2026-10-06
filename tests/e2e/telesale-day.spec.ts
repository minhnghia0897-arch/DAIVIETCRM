import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Lát 0 (docs/ke-hoach-thong-luong.md): một ngày telesale chạy hết trên CRM. Việc gọi đầu → hồ sơ lead → Gọi (số
// chỉ hiện cho người giữ lead, có nhật ký) → ghi kết quả có hẹn → việc hẹn gọi lại hiện ra → ghi chú → chưa đủ 4
// thông tin thì không sang Demo, đủ thì sang được. Ghi vào database nên chỉ chạy một cỡ màn, sau `pnpm db:reset`.

const LEAD_THU = "/leads/33333333-3333-4333-8333-000000000001";

test("một ngày của telesale trên CRM", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
  await login(page, USERS.thao);

  await page.goto("/tasks");
  await page.getByRole("button", { name: "Gọi lead mới từ Form Facebook" }).click();
  await expect(page).toHaveURL(new RegExp(`${LEAD_THU}$`));
  const profile = page.getByRole("region", { name: "Hồ sơ lead Nguyễn Thị Thu" });
  await expect(profile.getByRole("heading", { name: "Nguyễn Thị Thu" })).toBeVisible();
  await expect(profile.getByText("Ẩn vì Giữ bất ngờ")).toBeVisible();
  await expect(profile.getByRole("button", { name: "Chuyển sang Demo" })).toBeDisabled();

  // Gọi: server trả số đầy đủ của đúng lead này, mở bảng ghi kết quả.
  await profile.getByRole("button", { name: "Gọi Thu" }).click();
  await expect(profile.getByText("+821012342290")).toBeVisible();
  await expect(profile.getByText("Lượt xem số được ghi lại.")).toBeVisible();

  const form = profile.getByRole("form", { name: "Ghi kết quả cuộc gọi" });
  await form.getByRole("radiogroup", { name: "Kết quả" }).getByRole("radio", { name: "Hẹn gọi lại" }).click();
  await form
    .getByRole("button", { name: /^(Hôm nay|Mai|\d\d\/\d\d) \d\d:\d\d$/ })
    .first()
    .click();
  await form.getByRole("button", { name: "Lưu kết quả" }).click();
  await expect(page.getByRole("status")).toContainText("Đã ghi kết quả và hẹn gọi lại");

  const activity = profile.getByRole("list", { name: "Dòng hoạt động" });
  await expect(activity.getByText(/Điện thoại: Hẹn gọi lại/)).toBeVisible();
  await expect(
    profile.getByRole("list", { name: "Việc đang mở" }).getByText("Hẹn gọi lại: Gọi lại theo hẹn"),
  ).toBeVisible();

  // Ghi chú: số điện thoại gõ trong ghi chú bị che trước khi vào dòng sự kiện.
  await profile
    .getByRole("textbox", { name: "Ghi chú", exact: true })
    .fill("Khách hỏi ghế DV-X9, số phụ 0912345678");
  await profile.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(activity.getByText(/Khách hỏi ghế DV-X9/)).toBeVisible();
  await expect(activity.getByText(/0912345678/)).toHaveCount(0);

  // Đủ 4 thông tin thì sang Demo được.
  await profile.getByLabel("Tỉnh người nhận").selectOption("Nghệ An");
  await expect(page.getByRole("status")).toContainText("Đã lưu");
  await profile.getByLabel("Dịp mua").selectOption({ label: "Mừng thọ" });
  await profile.getByLabel("Ngân sách").selectOption({ label: "30–50tr" });
  await expect(profile.getByText("Thiếu thông tin bắt buộc")).toHaveCount(0);
  await profile.getByRole("button", { name: "Chuyển sang Demo" }).click();
  await expect(page.getByRole("status")).toContainText("Đã chuyển sang Demo");
  await expect(activity.getByText("Đã liên hệ → Đã tư vấn, demo")).toBeVisible();

  // Việc gọi đầu đã xong nhờ cuộc gọi; màn Việc thấy hẹn gọi lại mới.
  await page.goto("/tasks");
  await expect(page.getByRole("button", { name: "Gọi lead mới từ Form Facebook" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Gọi lại theo hẹn" }).first()).toBeVisible();
});

test("telesale không mở được hồ sơ lead của người khác", async ({ page }) => {
  await login(page, USERS.thao);
  const res = await page.goto("/leads/33333333-3333-4333-8333-000000000002");
  expect(res?.status()).toBe(404);
});

test("Owner duyệt đề xuất giảm giá của telesale trên màn Việc", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
  await login(page, USERS.owner);
  await page.goto("/tasks");
  const item = page.getByLabel(/Duyệt giảm giá: Giảm 7% cho khách quen/);
  await expect(item.getByText("An đề xuất")).toBeVisible();
  await item.getByRole("button", { name: "Duyệt" }).click();
  await expect(page.getByRole("status")).toContainText("Đã duyệt");
  await expect(item).toHaveCount(0);
});
