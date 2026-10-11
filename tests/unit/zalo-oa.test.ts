import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  ZaloError,
  oaOfToken,
  refreshOaToken,
  sendCsText,
  zaloErrorMessage,
  zaloUserName,
} from "@/lib/integrations/zalo_oa/api";
import { sharedPhone } from "@/lib/integrations/zalo_oa/inbound";
import {
  isUsedZaloEvent,
  oaIdOf,
  parseZaloWebhook,
  verifyZaloSignature,
  zaloExternalId,
} from "@/lib/integrations/zalo_oa/webhook";
import { vnMonthStart, zaloWindow } from "@/lib/integrations/zalo_oa/window";

const APP = "1234567890";
const OA_KEY = "oa-secret-thu";
const body = JSON.stringify({
  app_id: APP,
  event_name: "user_send_text",
  timestamp: "1760000000000",
  sender: { id: "7001" },
  recipient: { id: "4318" },
  message: { msg_id: "z.1", text: "Chào shop" },
});
const mac = createHash("sha256").update(`${APP}${body}1760000000000${OA_KEY}`).digest("hex");

describe("chữ ký webhook Zalo OA", () => {
  it("đúng OA Secret Key thì hợp lệ, có hoặc không có tiền tố mac=", () => {
    expect(verifyZaloSignature(body, mac, APP, OA_KEY, "1760000000000")).toBe(true);
    expect(verifyZaloSignature(body, `mac=${mac}`, APP, OA_KEY, "1760000000000")).toBe(true);
  });
  it("sai khóa, sửa thân, sai thời điểm, thiếu header thì không hợp lệ", () => {
    expect(verifyZaloSignature(body, mac, APP, "khac", "1760000000000")).toBe(false);
    expect(verifyZaloSignature(body.replace("Chào", "Chao"), mac, APP, OA_KEY, "1760000000000")).toBe(false);
    expect(verifyZaloSignature(body, mac, APP, OA_KEY, "1760000000001")).toBe(false);
    expect(verifyZaloSignature(body, null, APP, OA_KEY, "1760000000000")).toBe(false);
    expect(verifyZaloSignature(body, "abc", APP, OA_KEY, "1760000000000")).toBe(false);
  });
});

describe("đọc sự kiện Zalo OA", () => {
  const e = parseZaloWebhook(JSON.parse(body))!;
  it("lấy OA, mã chống trùng theo mã tin", () => {
    expect(oaIdOf(e)).toBe("4318");
    expect(zaloExternalId(e)).toBe("z.1");
  });
  it("tin OA gửi: OA là người gửi; sự kiện không có mã tin thì ghép tên, người, thời điểm", () => {
    const out = parseZaloWebhook({
      event_name: "oa_send_text",
      timestamp: 5,
      sender: { id: "4318" },
      recipient: { id: "7001" },
      message: { msg_id: "z.2" },
    })!;
    expect(oaIdOf(out)).toBe("4318");
    const info = parseZaloWebhook({
      event_name: "user_submit_info",
      timestamp: "9",
      sender: { id: "7001" },
      recipient: { id: "4318" },
      info: { phone: "0901" },
    })!;
    expect(zaloExternalId(info)).toBe("user_submit_info:7001:9");
  });
  it("chỉ lưu tin khách gửi, tin OA gửi, form thông tin", () => {
    expect(isUsedZaloEvent("user_send_image")).toBe(true);
    expect(isUsedZaloEvent("oa_send_text")).toBe(true);
    expect(isUsedZaloEvent("user_submit_info")).toBe(true);
    expect(isUsedZaloEvent("user_seen_message")).toBe(false);
    expect(isUsedZaloEvent("follow")).toBe(false);
    expect(parseZaloWebhook({ x: 1 })).toBeNull();
  });
});

describe("khung tin tư vấn Zalo", () => {
  const last = new Date("2026-10-08T00:00:00Z");
  const at = (h: number) => new Date(last.getTime() + h * 3_600_000);
  it("48 giờ đầu miễn phí, sau đó tính phí; chưa nhắn thì không gửi", () => {
    expect(zaloWindow(last, at(47.9)).mode).toBe("free");
    expect(zaloWindow(last, at(48)).mode).toBe("paid");
    expect(zaloWindow(null, at(1)).mode).toBe("closed");
  });
  it("đầu tháng theo giờ Việt Nam", () => {
    expect(vnMonthStart(new Date("2026-10-31T18:00:00Z")).toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(vnMonthStart(new Date("2026-10-08T03:00:00Z")).toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });
});

describe("số khách chia sẻ qua form", () => {
  it("chuẩn hóa, che số, suy thị trường", () => {
    expect(sharedPhone("0901 234 999")).toMatchObject({ e164: "+84901234999", valid: true, country: "VN" });
    expect(sharedPhone("+82 10-1234-5678")).toMatchObject({ e164: "+821012345678", country: "KR" });
    expect(sharedPhone("")).toBeNull();
    expect(sharedPhone(undefined)).toBeNull();
  });
});

describe("API Zalo OA", () => {
  const ok = (b: unknown) => vi.fn(async () => new Response(JSON.stringify(b), { status: 200 }));
  it("làm mới token gửi secret_key trong header, trả refresh token mới", async () => {
    const f = ok({
      access_token: "acc-moi-0123456789",
      refresh_token: "ref-moi-0123456789",
      expires_in: "90000",
    });
    const t = await refreshOaToken(
      { appId: APP, appSecret: "app-sec", refreshToken: "ref-cu" },
      f as unknown as typeof fetch,
    );
    expect(t.refreshToken).toBe("ref-moi-0123456789");
    expect(t.expiresAt.getTime()).toBeGreaterThan(Date.now() + 89_000_000);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth.zaloapp.com/v4/oa/access_token");
    expect((init.headers as Record<string, string>).secret_key).toBe("app-sec");
    expect(String(init.body)).toContain("grant_type=refresh_token");
  });
  it("Zalo trả lỗi trong thân (mã khác 0) thì ném lỗi có mã, không lộ token", async () => {
    const e = await refreshOaToken(
      { appId: APP, appSecret: "s", refreshToken: "bi-mat" },
      ok({ error: -14014, error_description: "x" }) as unknown as typeof fetch,
    ).catch((x) => x);
    expect(e).toBeInstanceOf(ZaloError);
    expect(e.code).toBe(-14014);
    expect(String(e.message)).not.toContain("bi-mat");
    expect(zaloErrorMessage(e)).toMatch(/hết hạn/);
  });
  it("gửi tin tư vấn với access_token trong header", async () => {
    const f = ok({ error: 0, message: "Success", data: { message_id: "z.out", user_id: "7001" } });
    expect(
      (await sendCsText({ accessToken: "acc", userId: "7001", text: "Dạ" }, f as unknown as typeof fetch))
        .messageId,
    ).toBe("z.out");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openapi.zalo.me/v3.0/oa/message/cs");
    expect((init.headers as Record<string, string>).access_token).toBe("acc");
    expect(JSON.parse(String(init.body))).toEqual({
      recipient: { user_id: "7001" },
      message: { text: "Dạ" },
    });
  });
  it("kiểm OA của token, tên khách; lỗi thì tên trả null", async () => {
    expect(
      await oaOfToken(
        "a",
        ok({ error: 0, data: { oa_id: 4318, name: "Đại Việt" } }) as unknown as typeof fetch,
      ),
    ).toEqual({ oaId: "4318", name: "Đại Việt" });
    expect(
      await zaloUserName(
        "7001",
        "a",
        ok({ error: 0, data: { display_name: "Lê Hoa" } }) as unknown as typeof fetch,
      ),
    ).toBe("Lê Hoa");
    expect(await zaloUserName("7001", "a", ok({ error: -213 }) as unknown as typeof fetch)).toBeNull();
  });
  it("câu lỗi dễ hiểu", () => {
    expect(zaloErrorMessage(new ZaloError(-213))).toMatch(/chưa quan tâm OA/);
    expect(zaloErrorMessage(new ZaloError(-1))).toMatch(/máy chủ Zalo/);
    expect(zaloErrorMessage(new ZaloError(-999))).toMatch(/mã -999/);
  });
});
