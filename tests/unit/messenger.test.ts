import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  GraphError,
  graphErrorMessage,
  pageOfToken,
  sendText,
  userName,
} from "@/lib/integrations/meta_messenger/api";
import { replyWindow, timeLeft } from "@/lib/integrations/meta_messenger/window";
import {
  firstPageId,
  parseMessengerWebhook,
  verifySignature,
} from "@/lib/integrations/meta_messenger/webhook";

const SECRET = "app-secret-thu";
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

const hook = (messaging: unknown[]) => ({ object: "page", entry: [{ id: "111", time: 1, messaging }] });
const msg = (extra: Record<string, unknown> = {}) => ({
  sender: { id: "9001" },
  recipient: { id: "111" },
  timestamp: 1_760_000_000_000,
  message: { mid: "m.1", text: "Chào shop", ...extra },
});

describe("chữ ký webhook Messenger", () => {
  const body = JSON.stringify(hook([msg()]));
  it("đúng App Secret thì hợp lệ", () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });
  it("sai secret, sửa thân, thiếu header thì không hợp lệ", () => {
    expect(verifySignature(body, sign(body), "khac")).toBe(false);
    expect(verifySignature(body.replace("Chào", "Chao"), sign(body), SECRET)).toBe(false);
    expect(verifySignature(body, null, SECRET)).toBe(false);
    expect(verifySignature(body, "sha1=abc", SECRET)).toBe(false);
    expect(verifySignature(body, "sha256=zz", SECRET)).toBe(false);
  });
});

describe("đọc webhook Messenger", () => {
  it("tách tin đến, echo và nút bấm; bỏ sự kiện đã đọc", () => {
    const items = parseMessengerWebhook(
      hook([
        msg(),
        {
          ...msg({ mid: "m.2", is_echo: true, metadata: "crm:x" }),
          sender: { id: "111" },
          recipient: { id: "9001" },
        },
        { sender: { id: "9001" }, recipient: { id: "111" }, timestamp: 5, postback: { title: "Bắt đầu" } },
        { sender: { id: "9001" }, recipient: { id: "111" }, timestamp: 6, read: { watermark: 1 } },
      ]),
    );
    expect(items?.map((i) => [i.externalId, i.eventType])).toEqual([
      ["m.1", "message"],
      ["m.2", "message_echo"],
      ["postback:9001:5", "postback"],
    ]);
    expect(items?.[0].pageId).toBe("111");
  });
  it("không phải webhook Page thì trả null; tin sai dạng bị bỏ qua", () => {
    expect(parseMessengerWebhook({ object: "instagram", entry: [] })).toBeNull();
    expect(parseMessengerWebhook("x")).toBeNull();
    expect(parseMessengerWebhook(hook([{ sender: {} }, msg()]))?.length).toBe(1);
  });
  it("lấy Page ID để tìm App Secret", () => {
    expect(firstPageId(hook([]))).toBe("111");
    expect(firstPageId({})).toBeNull();
  });
});

describe("khung nhắn tin", () => {
  const last = new Date("2026-10-08T00:00:00Z");
  const at = (h: number) => new Date(last.getTime() + h * 3_600_000);
  it("24 giờ đầu trả lời tự do, tới 7 ngày chỉ Human Agent, sau đó đóng", () => {
    expect(replyWindow(last, at(23.9)).mode).toBe("response");
    expect(replyWindow(last, at(24)).mode).toBe("human_agent");
    expect(replyWindow(last, at(24 * 7 - 0.1)).mode).toBe("human_agent");
    expect(replyWindow(last, at(24 * 7)).mode).toBe("closed");
    expect(replyWindow(null, at(1)).mode).toBe("closed");
  });
  it("đồng hồ còn lại làm tròn xuống", () => {
    expect(timeLeft(at(24), at(20.5))).toBe("còn 3 giờ 30 phút");
    expect(timeLeft(at(1), at(0.99))).toBe("còn 0 phút");
    expect(timeLeft(at(24 * 7), at(24))).toBe("còn 6 ngày");
    expect(timeLeft(at(1), at(2))).toBe("đã hết");
  });
});

describe("Graph API", () => {
  const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  const fail = (code: number, sub?: number) =>
    vi.fn(async () => new Response(JSON.stringify({ error: { code, error_subcode: sub } }), { status: 400 }));

  it("gửi tin trả lời kèm mã tin của CRM, token đi trong yêu cầu tới Meta", async () => {
    const f = ok({ recipient_id: "9001", message_id: "m.out" });
    const r = await sendText(
      { pageToken: "tok", psid: "9001", text: "Dạ", messagingType: "RESPONSE", metadata: "crm:1" },
      f as unknown as typeof fetch,
    );
    expect(r.mid).toBe("m.out");
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toMatch(/^https:\/\/graph\.facebook\.com\/v25\.0\/me\/messages\?access_token=tok$/);
    expect(JSON.parse(String(init.body))).toEqual({
      recipient: { id: "9001" },
      messaging_type: "RESPONSE",
      message: { text: "Dạ", metadata: "crm:1" },
    });
  });
  it("ngoài 24 giờ gửi thẻ HUMAN_AGENT", async () => {
    const f = ok({ message_id: "m" });
    await sendText(
      {
        pageToken: "t",
        psid: "1",
        text: "x",
        messagingType: "MESSAGE_TAG",
        tag: "HUMAN_AGENT",
        metadata: "crm:2",
      },
      f as unknown as typeof fetch,
    );
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [URL, RequestInit])[1].body));
    expect(body.messaging_type).toBe("MESSAGE_TAG");
    expect(body.tag).toBe("HUMAN_AGENT");
  });
  it("lỗi của Meta thành câu dễ hiểu, không lộ token", async () => {
    const e = await pageOfToken("bi-mat", fail(190) as unknown as typeof fetch).catch((x) => x);
    expect(e).toBeInstanceOf(GraphError);
    expect(String(e.message)).not.toContain("bi-mat");
    expect(graphErrorMessage(e)).toMatch(/token hết hạn/);
    expect(graphErrorMessage(new GraphError(10, 2018278))).toMatch(/24 giờ/);
    expect(graphErrorMessage(new GraphError(551))).toMatch(/không nhận được tin/);
    expect(graphErrorMessage(new GraphError(613))).toMatch(/quá nhanh/);
    expect(graphErrorMessage(new Error("x"))).toMatch(/Thử lại/);
  });
  it("không lấy được tên khách thì trả null", async () => {
    expect(await userName("9001", "t", fail(100) as unknown as typeof fetch)).toBeNull();
    expect(
      await userName("9001", "t", ok({ first_name: "Mai", last_name: "Trần" }) as unknown as typeof fetch),
    ).toBe("Trần Mai");
  });
});
