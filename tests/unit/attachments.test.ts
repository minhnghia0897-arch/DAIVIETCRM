import { describe, expect, it } from "vitest";

import { parseAttachments } from "@/lib/integrations/attachments";

describe("parseAttachments", () => {
  it("đọc ảnh Messenger và Zalo, tệp có tên", () => {
    expect(
      parseAttachments([
        { type: "image", payload: { url: "https://scontent.xx.fbcdn.net/a.jpg" } },
        { type: "photo", payload: { thumbnail: "https://photo.zdn.vn/t.jpg" } },
        { type: "file", payload: { url: "https://f.zdn.vn/b.pdf", name: "bao-gia.pdf" } },
        { type: "sticker", payload: { url: "https://s.fbcdn.net/s.png", sticker_id: 1 } },
      ]),
    ).toEqual([
      { kind: "image", url: "https://scontent.xx.fbcdn.net/a.jpg", name: null },
      { kind: "image", url: "https://photo.zdn.vn/t.jpg", name: null },
      { kind: "file", url: "https://f.zdn.vn/b.pdf", name: "bao-gia.pdf" },
      { kind: "sticker", url: "https://s.fbcdn.net/s.png", name: null },
    ]);
  });

  it("bỏ link không phải https và dữ liệu lạ", () => {
    expect(parseAttachments([{ type: "image", payload: { url: "javascript:alert(1)" } }])).toEqual([
      { kind: "image", url: null, name: null },
    ]);
    expect(parseAttachments([{ type: "location", payload: null }, null])).toEqual([
      { kind: "other", url: null, name: null },
      { kind: "other", url: null, name: null },
    ]);
    expect(parseAttachments("x")).toEqual([]);
  });
});
