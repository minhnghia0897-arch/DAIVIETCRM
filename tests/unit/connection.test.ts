import { describe, expect, it } from "vitest";

import {
  actionsFor,
  configErrors,
  connectBlockers,
  healthCheck,
  initialState,
  requiredSecrets,
  tokenDaysLeft,
} from "@/lib/integrations/connection";
import { getIntegration, integrations } from "@/lib/integrations/registry";

const meta = getIntegration("meta_lead_ads");
const smtp = getIntegration("email_smtp");

describe("kết nối đấu nối", () => {
  it("đấu nối chưa có cách kết nối thì là Sắp có", () => {
    expect(initialState(getIntegration("tiktok_shop")).status).toBe("not_available");
    expect(initialState(meta).status).toBe("not_connected");
    expect(
      connectBlockers(getIntegration("tiktok_shop"), initialState(getIntegration("tiktok_shop"))),
    ).toHaveLength(1);
  });

  it("đấu nối có kết nối thì có đủ nhãn cho khóa và ô cấu hình", () => {
    for (const i of integrations) {
      if (!("connectMode" in i)) continue;
      for (const s of i.secrets)
        expect(i.secretLabels?.[s as keyof typeof i.secretLabels], `${i.key}.${s}`).toBeTruthy();
    }
  });

  it("OAuth chỉ cần khóa ký webhook trước, token nhận khi đăng nhập", () => {
    expect(requiredSecrets(meta)).toEqual(["meta_app_secret"]);
    expect(requiredSecrets(smtp)).toEqual(["smtp_password"]);
  });

  it("kiểm cấu hình bằng schema, báo lỗi theo nhãn ô", () => {
    expect(configErrors(meta, { pageId: "abc", formIds: [] })).toEqual([
      "ID Page Facebook: ID Page là dãy số",
      "ID các form cần nhận: Chọn ít nhất một form",
    ]);
    expect(configErrors(meta, {})).toEqual([
      "ID Page Facebook: Chưa nhập",
      "ID các form cần nhận: Chưa nhập",
    ]);
    expect(configErrors(meta, { pageId: "104857300000001", formIds: ["2200000000001"] })).toEqual([]);
    expect(
      configErrors(smtp, { host: "smtp.example.com", port: "587", username: "u", fromAddress: "sai" }),
    ).toEqual(["Địa chỉ gửi: Địa chỉ gửi chưa đúng dạng email"]);
  });

  it("thiếu khóa hoặc cấu hình thì chưa kết nối được; điều kiện tiên quyết thiếu thì kết nối nhưng báo lỗi dễ hiểu", () => {
    const st = { ...initialState(meta), config: { pageId: "104857300000001", formIds: ["2200000000001"] } };
    expect(connectBlockers(meta, st)[0]).toContain("App Secret");
    const ready = { ...st, secrets: { meta_app_secret: "2026-10-04" } };
    expect(connectBlockers(meta, ready)).toEqual([]);
    expect(healthCheck(meta, ready, ["meta_app", "business_verified"]).message).toContain(
      "quản lý quyền truy cập lead của Business Manager",
    );
    expect(healthCheck(meta, ready, ["meta_app", "business_verified", "lead_access"])).toEqual({
      ok: true,
      message: "Kết nối hoạt động",
    });
  });

  it("nút theo trạng thái", () => {
    expect(actionsFor("not_connected")).toEqual(["connect"]);
    expect(actionsFor("connected")).toEqual(["test", "pause", "reconnect", "disconnect"]);
    expect(actionsFor("paused")).toEqual(["resume", "disconnect"]);
    expect(actionsFor("not_available")).toEqual([]);
  });

  it("đếm ngày token còn lại", () => {
    const st = { ...initialState(meta), tokenExpiresAt: "2026-10-06T00:00:00Z" };
    expect(tokenDaysLeft(st, new Date("2026-10-04T00:00:00Z"))).toBe(2);
    expect(tokenDaysLeft(initialState(meta), new Date())).toBeNull();
  });
});
