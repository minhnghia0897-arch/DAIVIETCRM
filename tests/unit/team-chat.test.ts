import { describe, expect, it } from "vitest";

import { deniedReason, visibleChats, type Who } from "@/components/crm/access";
import { initialState, maskPhonesInText, reducer } from "@/components/crm/store";

// Nhóm nội bộ: thành viên mới thấy và gửi được; kênh thông báo chỉ quản trị đăng; chủ đề riêng; số khách bị che.

const who = (me: string, extra: Partial<Who> = {}): Who => ({
  perms: new Set(),
  me,
  userId: me,
  isOwner: false,
  readOnly: false,
  ...extra,
});

describe("nhóm nội bộ", () => {
  it("che số điện thoại khách trước khi gửi, giữ 3 số cuối", () => {
    expect(maskPhonesInText("Gọi chị Thu 0912 345 678 nhé")).toBe("Gọi chị Thu 091•••678 nhé");
    expect(maskPhonesInText("Số Hàn +82 10-5521-2290")).toBe("Số Hàn +821•••290");
    expect(maskPhonesInText("Đơn Q4-2610-0012, 3 ghế")).toBe("Đơn Q4-2610-0012, 3 ghế");
  });

  it("chỉ thấy nhóm mình là thành viên; người ngoài nhóm không gửi được", () => {
    const s = initialState();
    expect(visibleChats(s, who("Linh")).map((c) => c.id)).not.toContain("c-tele");
    expect(
      deniedReason(
        s,
        { type: "chatSend", chatId: "c-tele", topicId: "general", text: "x", actor: "Linh" },
        who("Linh"),
      ),
    ).toBeTruthy();
  });

  it("kênh thông báo chỉ quản trị đăng tin; không tạo chủ đề trong kênh", () => {
    const s = initialState();
    const send = (me: string) =>
      deniedReason(
        s,
        { type: "chatSend", chatId: "c-news", topicId: "general", text: "x", actor: me },
        who(me),
      );
    expect(send("Thảo")).toContain("quản trị");
    expect(send("Hà")).toBeNull();
    expect(
      deniedReason(s, { type: "chatTopicCreate", chatId: "c-news", name: "A", actor: "Hà" }, who("Hà")),
    ).toBeTruthy();
  });

  it("tạo chủ đề mới, gửi tin vào đúng chủ đề, số đếm chưa đọc theo chủ đề", () => {
    let s = initialState();
    s = reducer(s, { type: "chatTopicCreate", chatId: "c-all", name: "Đơn Tết", actor: "Thảo" });
    const topic = s.chats.find((c) => c.id === "c-all")!.topics.at(-1)!;
    expect(topic.name).toBe("Đơn Tết");
    s = reducer(s, {
      type: "chatSend",
      chatId: "c-all",
      topicId: topic.id,
      text: "Số khách 0912345678",
      actor: "Thảo",
    });
    const t = s.chats.find((c) => c.id === "c-all")!.topics.find((x) => x.id === topic.id)!;
    expect(t.messages[0].text).toBe("Số khách 091•••678");
    expect(s.chatSeen[`c-all/${topic.id}`]).toBe(1);
    expect(
      s.chats.find((c) => c.id === "c-all")!.topics[0].messages.some((m) => m.text.includes("Số khách")),
    ).toBe(false);
  });

  it("chế độ Xem như không gửi được tin", () => {
    const s = initialState();
    expect(
      deniedReason(
        s,
        { type: "chatSend", chatId: "c-all", topicId: "general", text: "x", actor: "Hà" },
        who("Hà", { readOnly: true }),
      ),
    ).toContain("chỉ đọc");
  });
});
