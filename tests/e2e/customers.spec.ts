import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Màn Khách bản thật (migration 20261012000400_customers_live.sql): danh sách theo vòng đời và thị trường đúng quyền
// xem, hồ sơ 360 với Giữ bất ngờ, gọi, đồng ý, Ngừng liên hệ, ngày quan trọng, trích xuất dữ liệu. Chạy sau
// `pnpm db:reset`. Bài ghi vào database chỉ chạy ở một cỡ màn.

const THU = "22222222-2222-4222-8222-000000000001";
const LUC = "22222222-2222-4222-8222-000000000002";

test("danh sách khách: đúng quyền xem, lọc theo thị trường, không còn nhãn mô phỏng", async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Khách của showroom" })).toBeVisible();
  await expect(page.getByRole("contentinfo", { name: "Tiện ích" }).getByText("Dữ liệu mô phỏng")).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Nguyễn Thị Thu" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Phạm Ngọc Lan" })).toBeVisible();

  await page.getByLabel("Thị trường").selectOption("KR");
  await expect(page).toHaveURL(/market=KR/);
  await expect(page.getByRole("link", { name: "Nguyễn Thị Thu" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Phạm Ngọc Lan" })).toHaveCount(0);

  // Telesale chỉ thấy khách thuộc lead mình giữ (người đặt và người nhận).
  await login(page, USERS.thao);
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Khách của tôi" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nguyễn Thị Thu" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nguyễn Văn Lực" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Phạm Ngọc Lan" })).toHaveCount(0);
});

test("hồ sơ khách: giữ bất ngờ chặn gọi người nhận, người giữ lead gọi được người đặt", async ({ page }) => {
  await login(page, USERS.thao);
  await page.goto(`/customers/${LUC}`);
  await expect(page.getByRole("heading", { name: "Nguyễn Văn Lực" })).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "Giữ bất ngờ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gọi" })).toBeDisabled();

  await page.goto(`/customers/${THU}`);
  await expect(page.getByRole("heading", { name: "Nguyễn Thị Thu" })).toBeVisible();
  await expect(page.getByText("+82 10••••2290")).toBeVisible();
  await page.getByRole("button", { name: "Gọi" }).click();
  await expect(page.getByText("+821012342290")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ghi kết quả cuộc gọi ở hồ sơ lead" })).toBeVisible();

  // Telesale không giữ lead của khách thì không mở được hồ sơ (soft 404 vì có khung chờ loading.tsx).
  await login(page, USERS.an);
  await page.goto(`/customers/${THU}`);
  await expect(page.getByRole("heading", { name: "Không tìm thấy" })).toBeVisible();
  await expect(page.getByText("Nguyễn Thị Thu")).toHaveCount(0);
});

test("đồng ý, ngừng liên hệ, ngày quan trọng, trích xuất dữ liệu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
  const phone = `09${String(Date.now()).slice(-8)}`;
  const name = `Khách 360 ${phone.slice(-4)}`;

  await login(page, USERS.saleAdmin);
  await page.goto("/leads");
  await page.getByRole("button", { name: "Tạo lead" }).click();
  const form = page.getByRole("form", { name: "Tạo lead" });
  await form.getByLabel("Họ tên").fill(name);
  await form.getByLabel("Số điện thoại").fill(phone);
  await form.getByLabel("Nguồn").selectOption({ label: "Khách đến showroom" });
  await form.getByRole("button", { name: "Lưu lead" }).click();
  await expect(form.getByRole("status")).toContainText(/Đã tạo lead/);

  await page.goto(`/customers?q=${encodeURIComponent(name)}`);
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const header = page.getByRole("region", { name: `Hồ sơ khách ${name}` });
  await expect(header.getByText("Lead", { exact: true })).toBeVisible();

  // Đồng ý nhận tin khuyến mãi: ghi vào dòng sự kiện.
  const consent = page.getByRole("region", { name: "Liên hệ và đồng ý" });
  const marketing = consent.getByRole("switch", { name: "Tin khuyến mãi, làm nóng lại, Mọi kênh" });
  await expect(marketing).toHaveAttribute("aria-checked", "false");
  await marketing.click();
  await expect(marketing).toHaveAttribute("aria-checked", "true");
  await expect(
    page
      .getByRole("region", { name: "Dòng sự kiện" })
      .getByText("Khách đồng ý: Tin khuyến mãi, làm nóng lại, Mọi kênh"),
  ).toBeVisible();

  // Ngừng mọi liên hệ: giai đoạn Ngừng liên hệ, không gọi được; cho liên hệ lại thì về Lead.
  await consent.getByRole("switch", { name: "Ngừng mọi liên hệ" }).click();
  await expect(header.getByText("Ngừng liên hệ", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gọi" })).toBeDisabled();
  await consent.getByRole("switch", { name: "Ngừng mọi liên hệ" }).click();
  await expect(header.getByText("Lead", { exact: true })).toBeVisible();

  // Ngày quan trọng.
  const dates = page.getByRole("region", { name: "Ngày quan trọng" });
  await dates.getByRole("button", { name: "Thêm ngày" }).click();
  await dates.getByLabel("Tên ngày").fill("Sinh nhật bố");
  await dates.getByLabel("Ngày", { exact: true }).fill("1960-03-15");
  await dates.getByRole("button", { name: "Lưu ngày" }).click();
  await expect(dates.getByText("15/03, hằng năm")).toBeVisible();

  // Sale admin không có quyền xuất file: không có mục trích xuất. Owner trích xuất được, file có số đầy đủ.
  await expect(page.getByRole("region", { name: "Dữ liệu và quyền riêng tư" })).toHaveCount(0);
  const url = page.url();
  await login(page, USERS.owner);
  await page.goto(url);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Trích xuất dữ liệu của khách" }).click();
  const file = await (await download).path();
  const data = JSON.parse(await readFile(file, "utf8"));
  expect(data.khach.ho_ten).toBe(name);
  expect(data.dinh_danh[0].gia_tri).toBe(`+84${phone.slice(1)}`);
  expect(data.ngay_quan_trong[0].loai).toBe("Sinh nhật bố");
});
