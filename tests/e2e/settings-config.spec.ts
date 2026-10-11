import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Cài đặt Phân lead, Thị trường, Danh mục trên bản thật (migration 20261008000100_sla_alerts_settings.sql).
// Ghi vào database nên chỉ chạy một cỡ màn, sau `pnpm db:reset`; mỗi bài trả lại giá trị cũ khi xong.

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
});

test("sale admin sửa hạn gọi và giới hạn lead chưa gọi", async ({ page }) => {
  await login(page, USERS.saleAdmin);
  await page.goto("/settings/assignment");
  const sla = page.getByLabel("Hạn gọi lần đầu (phút)");
  await expect(sla).toHaveValue("5");
  await expect(page.getByRole("region", { name: "Người đang nhận lead" })).toContainText("Thảo");
  await sla.fill("7");
  await page.getByRole("button", { name: "Lưu luật phân lead" }).click();
  await expect(page.getByText("Đã lưu: gọi trong 7 phút, tối đa 10 lead chưa gọi")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Hạn gọi lần đầu (phút)")).toHaveValue("7");
  await page.getByLabel("Hạn gọi lần đầu (phút)").fill("5");
  await page.getByRole("button", { name: "Lưu luật phân lead" }).click();
  await expect(page.getByText("Đã lưu: gọi trong 5 phút")).toBeVisible();
});

test("thị trường: khung gọi Hàn hiện giờ VN tương đương; thêm thị trường mới", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/settings/markets");
  const kr = page.getByRole("region", { name: "Hàn Quốc" });
  await expect(kr).toContainText("tức 17:00–20:30 giờ VN");

  const code = `J${String.fromCharCode(65 + (Date.now() % 26))}`;
  await page.getByRole("button", { name: "Thêm thị trường" }).click();
  const draft = page.getByRole("region", { name: "Thị trường mới" });
  await draft.getByLabel("Tên").fill(`Thử ${code}`);
  await draft.getByLabel("Mã quốc gia").fill(code);
  await draft.getByLabel("Múi giờ").fill("Asia/Tokyo");
  await expect(draft).toContainText("tức 17:00–20:00 giờ VN");
  // ZNS chỉ cho số Việt Nam.
  await draft.getByLabel("Tin ZNS").check();
  await draft.getByRole("button", { name: "Thêm thị trường" }).click();
  await expect(page.getByText("Tin ZNS chỉ gửi được tới số Việt Nam.").last()).toBeVisible();
  await draft.getByLabel("Tin ZNS").uncheck();
  await draft.getByRole("button", { name: "Thêm thị trường" }).click();
  await expect(page.getByText(`Đã thêm thị trường Thử ${code}`)).toBeVisible();
  await expect(page.getByRole("region", { name: `Thử ${code}` })).toBeVisible();
});

test("danh mục: thêm, đổi tên, ẩn mục; telesale chỉ xem", async ({ page }) => {
  await login(page, USERS.saleAdmin);
  await page.goto("/settings/catalog");
  await page.getByRole("tab", { name: "Dịp tặng" }).click();
  const name = `Dịp thử ${String(Date.now()).slice(-5)}`;
  await page.getByLabel("Thêm vào Dịp tặng").fill(name);
  await page.getByRole("button", { name: "Thêm", exact: true }).click();
  await expect(page.getByText(`Đã thêm ${name} vào Dịp tặng`)).toBeVisible();

  const list = page.getByRole("list", { name: "Dịp tặng" });
  await list.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Đổi tên" }).click();
  await page.getByLabel(`Đổi tên ${name}`).fill(`${name} mới`);
  await page.getByRole("button", { name: "Lưu tên" }).click();
  await expect(list.getByText(`${name} mới`)).toBeVisible();
  await list.getByRole("switch", { name: `Dùng ${name} mới` }).click();
  await expect(page.getByText(`Đã ẩn ${name} mới`)).toBeVisible();
  await expect(list.getByRole("switch", { name: `Dùng ${name} mới` })).toHaveAttribute(
    "aria-checked",
    "false",
  );

  await login(page, USERS.thao);
  await page.goto("/settings/catalog");
  await expect(page.getByText("Anh chị chỉ có quyền xem danh mục.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Danh mục tra cứu" }).getByRole("switch")).toHaveCount(0);
});
