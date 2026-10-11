import { expect, test } from "@playwright/test";

import { USERS, login } from "./helpers";

// Ca trực, công tắc Trực, ngày nghỉ trên bản thật (migration 20261007000900_duty_shifts.sql). Ghi vào database nên
// chỉ chạy một cỡ màn, sau `pnpm db:reset`. Dữ liệu giả: Thảo và An đang bật Trực, chưa ai được xếp ca.

test("telesale bật, tắt Trực trên thanh trên cùng", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
  await login(page, USERS.thao);
  const sw = page.getByRole("switch", { name: "Đang trực" });
  await expect(sw).toHaveAttribute("aria-checked", "true");

  await sw.click();
  await expect(page.getByText("Đã tắt trực, không nhận lead mới")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Đang trực" })).toHaveAttribute("aria-checked", "false");

  await page.getByRole("switch", { name: "Đang trực" }).click();
  await expect(page.getByText(/Đã bật trực/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Đang trực" })).toHaveAttribute("aria-checked", "true");
});

test("sale admin không nhận lead nên không có công tắc Trực", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Một cỡ màn là đủ");
  await login(page, USERS.saleAdmin);
  await expect(page.getByRole("switch", { name: "Đang trực" })).toHaveCount(0);
});

test("ngày nghỉ: không bật Trực được, quản lý tắt trực hộ", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
  const owner = await browser.newPage();
  await login(owner, USERS.owner);
  await owner.goto("/team/absences");
  const on = owner.getByRole("region", { name: /Đang trực/ });
  await expect(on.getByText("An", { exact: true })).toBeVisible();

  // Ghi An nghỉ hôm nay, rồi tắt trực hộ An.
  const form = owner.getByRole("form", { name: "Ghi ngày nghỉ" });
  await form.getByLabel("Người nghỉ").selectOption({ label: "An" });
  await form.getByLabel("Loại").selectOption({ label: "Nghỉ ốm" });
  await form.getByRole("button", { name: "Ghi ngày nghỉ" }).click();
  await expect(owner.getByText("Đã ghi ngày nghỉ")).toBeVisible();
  await expect(owner.getByText(/Nghỉ hôm nay: .*An/)).toBeVisible();
  const anRow = on.getByRole("listitem").filter({ hasText: "An" });
  await anRow.getByRole("button", { name: "Tắt trực hộ" }).click();
  await expect(owner.getByText("Đã tắt trực hộ")).toBeVisible();
  await expect(owner.getByRole("cell", { name: "Quản lý tắt hộ" })).toBeVisible();

  // An đăng nhập: bật Trực bị từ chối vì có lịch nghỉ.
  const an = await browser.newPage();
  await login(an, USERS.an);
  const sw = an.getByRole("switch", { name: "Đang trực" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(an.getByText("Hôm nay anh chị có lịch nghỉ nên không bật Trực được.")).toBeVisible();
  await an.reload();
  await expect(an.getByRole("switch", { name: "Đang trực" })).toHaveAttribute("aria-checked", "false");

  // Dọn: hủy ngày nghỉ, An bật Trực lại để các kiểm thử khác vẫn có người nhận lead.
  await owner.reload();
  await owner
    .getByRole("region", { name: "Ngày nghỉ" })
    .getByRole("listitem")
    .filter({ hasText: "An" })
    .getByRole("button", { name: "Hủy" })
    .click();
  await expect(owner.getByText("Đã hủy ngày nghỉ")).toBeVisible();
  await an.getByRole("switch", { name: "Đang trực" }).click();
  await expect(an.getByText(/Đã bật trực/)).toBeVisible();
});

test("Cài đặt ca trực: thêm ca, xếp người vào ca", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "Ghi vào database, chỉ chạy một lần");
  await login(page, USERS.owner);
  await page.goto("/settings/shifts");
  await expect(page.getByRole("region", { name: "Ca ngày" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ca tối" })).toBeVisible();

  // Ca thử phủ cả ngày, để xếp Thảo vào không làm job tự tắt Trực của Thảo khi chạy e2e ngoài giờ.
  await page.getByRole("button", { name: "Thêm ca" }).click();
  const draft = page.getByRole("region", { name: "Ca mới" });
  await draft.getByLabel("Tên ca").fill("Ca thử cả ngày");
  for (const d of ["CN"]) await draft.getByRole("button", { name: d, exact: true }).click();
  await draft.getByLabel("Ca mới bắt đầu").fill("00:00");
  await draft.getByLabel("Ca mới kết thúc").fill("23:59");
  await draft.getByRole("button", { name: "Thêm ca" }).click();
  await expect(page.getByText("Đã thêm Ca thử cả ngày")).toBeVisible();

  const shift = page.getByRole("region", { name: "Ca thử cả ngày" });
  await expect(shift).toBeVisible();
  const thao = shift.getByRole("group", { name: /người trong ca/ }).getByRole("button", { name: "Thảo" });
  await thao.click();
  await expect(page.getByText("Đã thêm vào ca")).toBeVisible();
  await expect(thao).toHaveAttribute("aria-pressed", "true");
});
