import { describe, expect, it } from "vitest";

import {
  actionsFor,
  configErrors,
  connectBlockers,
  healthCheck,
  fillFromLogin,
  initialState,
  isOauthToken,
  quickFields,
  missingSummary,
  PREREQ_ERRORS,
  requiredSecrets,
  tokenDaysLeft,
} from "@/lib/integrations/connection";
import { getIntegration, integrations, type IntegrationDefinition } from "@/lib/integrations/registry";

const meta = getIntegration("meta_lead_ads");
const smtp = getIntegration("email_smtp");

describe("kết nối đấu nối", () => {
  it("đấu nối chưa có cách kết nối thì là Sắp có", () => {
    const later: IntegrationDefinition = { ...meta, key: "later", connectMode: undefined };
    expect(initialState(later).status).toBe("not_available");
    expect(initialState(meta).status).toBe("not_connected");
    expect(connectBlockers(later, initialState(later))).toHaveLength(1);
  });

  it("mọi đấu nối trong sổ đăng ký đều cấu hình được: có cách kết nối, nhãn khóa, nhãn ô, nội dung thử", () => {
    for (const d of integrations as readonly IntegrationDefinition[]) {
      expect(d.connectMode, d.key).toBeTruthy();
      expect(d.testLabel, d.key).toBeTruthy();
      if (d.connectMode === "oauth") expect(d.oauthScopes, d.key).toBeTruthy();
      for (const s of d.secrets) expect(d.secretLabels?.[s], `${d.key}.${s}`).toBeTruthy();
      // Mọi khóa của schema có ô nhập tương ứng, để lỗi cấu hình luôn chỉ ra được ô cần sửa.
      const shape = Object.keys((d.configSchema as unknown as { shape: object }).shape);
      for (const k of shape.filter((x) => x !== "webhookPath"))
        expect(
          d.configFields?.some((f) => f.key === k),
          `${d.key}.${k}`,
        ).toBe(true);
      for (const p of d.prerequisites) expect(PREREQ_ERRORS[p.key], `${d.key}.${p.key}`).toBeTruthy();
    }
  });

  it("dòng tóm tắt chỉ ghi tên phần còn thiếu", () => {
    // Page và form chọn sau khi đăng nhập nên chỉ còn thiếu khóa.
    expect(missingSummary(meta, initialState(meta))).toEqual(["App Secret của ứng dụng Meta"]);
    const ai = getIntegration("ai_llm");
    // AI mặc định không bật chức năng nào; vẫn kết nối được khi đủ mô hình, giới hạn chi phí và khóa.
    expect(
      connectBlockers(ai, {
        ...initialState(ai),
        config: { model: "claude-sonnet-5-5", monthlyBudget: "2000000" },
        secrets: { ai_llm_api_key: "2026-10-04" },
      }),
    ).toEqual([]);
    expect(
      missingSummary(getIntegration("call_provider"), initialState(getIntegration("call_provider"))),
    ).toEqual(["API key tổng đài"]);
    const storage = getIntegration("file_storage");
    expect(requiredSecrets(storage)).toEqual([]);
  });

  it("OAuth chỉ cần khóa ký webhook trước, token nhận khi đăng nhập", () => {
    expect(requiredSecrets(meta)).toEqual(["meta_app_secret"]);
    expect(requiredSecrets(smtp)).toEqual(["smtp_password"]);
  });

  it("chỉ token nhận qua OAuth mới là token tự động; access token nhập tay của khóa API phải nhập và được giữ", () => {
    const capi = getIntegration("meta_capi");
    expect(isOauthToken(capi, "capi_access_token")).toBe(false);
    expect(requiredSecrets(capi)).toEqual(["capi_access_token"]);
    expect(isOauthToken(meta, "meta_page_access_token")).toBe(true);
  });

  it("kết nối nhanh: điền sẵn giá trị mặc định, chỉ hỏi ô không đoán được, ô sau đăng nhập lấy từ danh sách", () => {
    expect(initialState(smtp).config).toEqual({ port: "587" });
    expect(quickFields(smtp).map((f) => f.key)).toEqual(["host", "username", "fromAddress"]);
    expect(quickFields(meta)).toEqual([]);
    expect(quickFields(getIntegration("file_storage"))).toEqual([]);
    const filled = fillFromLogin(meta, initialState(meta).config);
    expect(filled.pageId).toBe("104857300000001");
    expect(filled.formIds).toEqual(["2200000000001", "2200000000002"]);
    // Lựa chọn của Owner được giữ.
    expect(fillFromLogin(meta, { formIds: ["2200000000002"] }).formIds).toEqual(["2200000000002"]);
    expect(configErrors(meta, filled)).toEqual([]);
  });

  it("kiểm cấu hình bằng schema, báo lỗi theo nhãn ô", () => {
    expect(configErrors(meta, { pageId: "abc", formIds: [] })).toEqual([
      "Page Facebook: ID Page là dãy số",
      "Các form cần nhận: Chọn ít nhất một form",
    ]);
    expect(configErrors(meta, {})).toEqual(["Page Facebook: Chưa nhập", "Các form cần nhận: Chưa nhập"]);
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
    // Vài phút sau khi nhận token vẫn ghi đủ số ngày.
    expect(tokenDaysLeft(st, new Date("2026-10-04T00:05:00Z"))).toBe(2);
    expect(tokenDaysLeft(initialState(meta), new Date())).toBeNull();
  });
});
