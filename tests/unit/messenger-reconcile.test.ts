import { describe, expect, it, vi } from "vitest";

import { conversationMessages, GraphError, pageConversations } from "@/lib/integrations/meta_messenger/api";
import {
  graphMessageToItem,
  graphTime,
  reconcileErrorMessage,
  RECONCILE_ERROR_PREFIX,
  sameMessage,
  webhookAttachments,
} from "@/lib/integrations/meta_messenger/reconcile";
import { parseAttachments } from "@/lib/integrations/attachments";

// Đọc lại tin Messenger bị lỡ: đổi tin Graph sang dạng webhook, nhận ra tin đã có, câu lỗi cho Owner.

const PAGE = "104857300000001";
const PSID = "7788990011";

describe("graphTime", () => {
  it("đọc giờ Meta trả kèm múi +0000, giây Unix và mili giây", () => {
    expect(graphTime("2026-10-11T15:51:50+0000")).toBe(Date.UTC(2026, 9, 11, 15, 51, 50));
    expect(graphTime("2026-10-11T22:51:50+0700")).toBe(Date.UTC(2026, 9, 11, 15, 51, 50));
    expect(graphTime("1791733910")).toBe(1791733910000);
    expect(graphTime(1791733910)).toBe(1791733910000);
    expect(graphTime(1791733910000)).toBe(1791733910000);
  });

  it("sai dạng thì null", () => {
    expect(graphTime(undefined)).toBeNull();
    expect(graphTime("")).toBeNull();
    expect(graphTime("hôm qua")).toBeNull();
    expect(graphTime(Number.NaN)).toBeNull();
  });
});

describe("webhookAttachments", () => {
  it("ảnh, video, tệp, âm thanh, nhãn dán sang dạng webhook mà màn Hội thoại đọc được", () => {
    const out = webhookAttachments({
      id: "m_1",
      sticker: "https://scontent.xx.fbcdn.net/sticker.png",
      attachments: {
        data: [
          {
            mime_type: "image/jpeg",
            name: "anh.jpg",
            image_data: { url: "https://scontent.xx.fbcdn.net/a.jpg" },
          },
          { mime_type: "video/mp4", video_data: { url: "https://video.xx.fbcdn.net/v.mp4" } },
          { mime_type: "application/pdf", name: "baogia.pdf", file_url: "https://cdn.fbsbx.com/f.pdf" },
          { mime_type: "audio/mpeg", file_url: "https://cdn.fbsbx.com/voice.mp3" },
          { mime_type: "image/png" },
        ],
      },
    });
    expect(out.map((a) => a.type)).toEqual(["image", "video", "file", "audio", "sticker"]);
    expect(parseAttachments(out)).toEqual([
      { kind: "image", url: "https://scontent.xx.fbcdn.net/a.jpg", name: "anh.jpg" },
      { kind: "video", url: "https://video.xx.fbcdn.net/v.mp4", name: null },
      { kind: "file", url: "https://cdn.fbsbx.com/f.pdf", name: "baogia.pdf" },
      { kind: "audio", url: "https://cdn.fbsbx.com/voice.mp3", name: null },
      { kind: "sticker", url: "https://scontent.xx.fbcdn.net/sticker.png", name: null },
    ]);
  });
});

describe("graphMessageToItem", () => {
  it("tin của khách thành tin đến, giữ mã tin của Meta làm mã chống trùng", () => {
    const it1 = graphMessageToItem(PAGE, PSID, {
      id: "m_abc",
      created_time: "2026-10-11T15:51:50+0000",
      from: { id: PSID, name: "Khách" },
      message: "Ghế này giá bao nhiêu ạ",
    });
    expect(it1).toEqual({
      pageId: PAGE,
      externalId: "m_abc",
      eventType: "message",
      via: "reconcile",
      item: {
        sender: { id: PSID },
        recipient: { id: PAGE },
        timestamp: Date.UTC(2026, 9, 11, 15, 51, 50),
        message: { mid: "m_abc", text: "Ghế này giá bao nhiêu ạ" },
      },
    });
  });

  it("tin Page gửi (kể cả trả lời trên hộp thư Facebook) thành bản sao tin của Page", () => {
    const it2 = graphMessageToItem(PAGE, PSID, {
      id: "m_page",
      created_time: "2026-10-11T15:52:10+0000",
      from: { id: PAGE, name: "Đại Việt" },
      to: { data: [{ id: PSID }] },
      attachments: {
        data: [{ mime_type: "image/jpeg", image_data: { url: "https://scontent.xx.fbcdn.net/b.jpg" } }],
      },
    });
    expect(it2?.eventType).toBe("message_echo");
    expect(it2?.item.sender.id).toBe(PAGE);
    expect(it2?.item.recipient.id).toBe(PSID);
    expect(it2?.item.message).toEqual({
      mid: "m_page",
      is_echo: true,
      attachments: [{ type: "image", payload: { url: "https://scontent.xx.fbcdn.net/b.jpg" } }],
    });
  });

  it("bỏ tin rỗng, tin thiếu giờ, PSID lạ", () => {
    const base = { id: "m_x", created_time: "2026-10-11T15:51:50+0000", from: { id: PSID } };
    expect(graphMessageToItem(PAGE, PSID, { ...base, message: "   " })).toBeNull();
    expect(graphMessageToItem(PAGE, PSID, { ...base, created_time: undefined, message: "a" })).toBeNull();
    expect(graphMessageToItem(PAGE, "abc", { ...base, message: "a" })).toBeNull();
  });
});

describe("sameMessage", () => {
  const at = Date.UTC(2026, 9, 11, 15, 51, 50);
  const inbound = graphMessageToItem(PAGE, PSID, {
    id: "m_in",
    created_time: new Date(at).toISOString(),
    from: { id: PSID },
    message: "ok",
  })!;
  const outbound = graphMessageToItem(PAGE, PSID, {
    id: "m_out",
    created_time: new Date(at).toISOString(),
    from: { id: PAGE },
    message: "Dạ em gửi báo giá",
  })!;

  it("tin khách cùng chữ, lệch dưới 5 giây coi là đã có; khác chữ hoặc lệch xa thì không", () => {
    expect(sameMessage(inbound, { direction: "in", text: "ok", at: at + 3000, files: 0 })).toBe(true);
    expect(sameMessage(inbound, { direction: "in", text: "ok", at: at + 8000, files: 0 })).toBe(false);
    expect(sameMessage(inbound, { direction: "in", text: "oke", at, files: 0 })).toBe(false);
    expect(sameMessage(inbound, { direction: "out", text: "ok", at, files: 0 })).toBe(false);
    expect(sameMessage(inbound, { direction: "in", text: "ok", at, files: 1 })).toBe(false);
  });

  it("tin CRM gửi được nhận ra trong 90 giây (CRM ghi giờ lúc gửi xong)", () => {
    expect(
      sameMessage(outbound, { direction: "out", text: "Dạ em gửi báo giá", at: at - 60_000, files: 0 }),
    ).toBe(true);
    expect(
      sameMessage(outbound, { direction: "out", text: "Dạ em gửi báo giá", at: at - 120_000, files: 0 }),
    ).toBe(false);
  });
});

describe("reconcileErrorMessage", () => {
  it("thiếu quyền đọc hội thoại thì chỉ cách lấy token mới", () => {
    const m = reconcileErrorMessage(
      new GraphError(100, undefined, "requires pages_read_engagement permission"),
    );
    expect(m.startsWith(RECONCILE_ERROR_PREFIX)).toBe(true);
    expect(m).toContain("pages_read_engagement");
    expect(reconcileErrorMessage(new GraphError(10))).toContain("pages_read_engagement");
  });

  it("token hỏng, mạng lỗi, gọi quá nhanh có câu riêng; mã lạ vẫn nêu mã", () => {
    expect(reconcileErrorMessage(new GraphError(190))).toContain("hết hạn hoặc bị thu hồi");
    expect(reconcileErrorMessage(new GraphError(-1))).toContain("không gọi được máy chủ Meta");
    expect(reconcileErrorMessage(new GraphError(613))).toContain("tạm giới hạn");
    expect(reconcileErrorMessage(new GraphError(100, undefined, "Unsupported get request"))).toContain(
      "mã 100",
    );
    expect(reconcileErrorMessage(new Error("x"))).toContain("lỗi không xác định");
  });
});

describe("Graph API đọc lại tin", () => {
  it("danh sách hội thoại: đúng đường, đủ trường, kèm con trỏ trang sau; token không lọt vào câu lỗi", async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo) => {
      const u = new URL(String(url));
      expect(u.pathname).toBe(`/v25.0/${PAGE}/conversations`);
      expect(u.searchParams.get("platform")).toBe("messenger");
      expect(u.searchParams.get("fields")).toBe("id,updated_time,participants");
      expect(u.searchParams.get("after")).toBe("cur1");
      return Response.json({ data: [{ id: "t_1", updated_time: "2026-10-11T15:51:50+0000" }] });
    });
    const r = await pageConversations(PAGE, "tok-bi-mat", "cur1", fetchImpl as typeof fetch);
    expect(r.data?.[0]?.id).toBe("t_1");

    const failing = vi.fn(async () =>
      Response.json({ error: { code: 10, message: "Requires pages_read_engagement" } }, { status: 400 }),
    );
    const err = await pageConversations(PAGE, "tok-bi-mat", undefined, failing as typeof fetch).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(GraphError);
    expect(String(err.message) + String(err.detail)).not.toContain("tok-bi-mat");
  });

  it("tin của hội thoại: lấy 20 tin cuối kèm tệp đính kèm", async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo) => {
      const u = new URL(String(url));
      expect(u.pathname).toBe("/v25.0/t_1/messages");
      expect(u.searchParams.get("limit")).toBe("20");
      expect(u.searchParams.get("fields")).toContain("attachments{");
      return Response.json({ data: [{ id: "m_1", created_time: "2026-10-11T15:51:50+0000" }] });
    });
    const r = await conversationMessages("t_1", "tok", fetchImpl as typeof fetch);
    expect(r.data?.[0]?.id).toBe("m_1");
  });
});
