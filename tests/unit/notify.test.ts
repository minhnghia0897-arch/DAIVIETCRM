import { describe, expect, it } from "vitest";

import { deniedReason, type Who } from "@/components/crm/access";
import { initialState, notesFor, reducerWithNotify, type CrmState } from "@/components/crm/store";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { defaultPrefs, eventsFor, formatNotify, inQuietHours, shortCustomer } from "@/lib/notify/events";

// Thông báo Telegram (lib/notify/events.ts, store notifyDiff): không lộ số, đúng người nhận, tự chọn mức chi tiết.

const PHONE = /\d[\d .-]{7,}\d/;

describe("viết tin", () => {
  const facts = {
    event: "lead_assigned" as const,
    to: "Thảo",
    at: "09:12",
    customer: "Nguyễn Thị Thu",
    market: "KR",
    product: "Ghế DV-X9",
    due: "09:17",
    path: "/m?tab=lead&id=o1",
  };

  it("rút gọn không có tên khách, chi tiết chỉ có tên gọi ngắn", () => {
    const short = formatNotify(facts, "short").text;
    const detail = formatNotify(facts, "detail").text;
    expect(short).not.toContain("Thu");
    expect(detail).toContain("Thu (Hàn)");
    expect(detail).not.toContain("Nguyễn");
    expect(detail).toContain("Ghế DV-X9");
  });

  it("tên gọi ngắn bỏ họ, gắn thị trường", () => {
    expect(shortCustomer("Trần Văn Bình", "VN")).toBe("Bình");
    expect(shortCustomer(undefined)).toBe("khách");
  });

  it("hẹn gọi lại có nút Xong và Hẹn lại", () => {
    const { buttons } = formatNotify(
      { event: "callback_due", to: "Thảo", at: "10:00", due: "10:00", taskId: "t1", path: "/m" },
      "short",
    );
    expect(buttons.map((b) => b.kind)).toEqual(["open", "task_done", "task_snooze"]);
  });
});

describe("giờ im lặng", () => {
  const q = { on: true, from: "22:00", to: "07:00" };
  it("khung qua nửa đêm", () => {
    expect(inQuietHours(q, "23:10")).toBe(true);
    expect(inQuietHours(q, "06:59")).toBe(true);
    expect(inQuietHours(q, "07:00")).toBe(false);
    expect(inQuietHours(q, "12:00")).toBe(false);
  });
  it("tắt thì không im lặng", () => {
    expect(inQuietHours({ ...q, on: false }, "23:10")).toBe(false);
  });
});

describe("sự kiện theo quyền", () => {
  it("telesale không thấy lỗi đấu nối, không thấy duyệt", () => {
    const tele = new Set(PERMISSIONS.filter((p) => p.defaults.includes("telesale")).map((p) => p.key));
    const keys = eventsFor(tele).map((e) => e.key);
    expect(keys).toContain("lead_assigned");
    expect(keys).not.toContain("integration_error");
    expect(keys).not.toContain("approval_needed");
  });
});

describe("sinh tin từ thao tác", () => {
  const allText = (s: CrmState, name: string) =>
    [
      ...notesFor(
        { ...s, notifyPrefs: { ...s.notifyPrefs, [name]: { ...defaultPrefs(), level: "detail" } } },
        name,
      ),
    ]
      .map((n) => n.text)
      .join("\n");

  it("giao lead báo người nhận, không có số điện thoại", () => {
    const s0 = initialState();
    const o = s0.opps.find((x) => x.owner && x.owner !== "Minh")!;
    const s1 = reducerWithNotify(s0, { type: "assignLead", oppId: o.id, to: "Minh", actor: "Minh" });
    const notes = s1.tgOutbox.filter((n) => n.to === "Minh" && n.event === "lead_assigned");
    expect(notes).toHaveLength(1);
    const text = allText(s1, "Minh");
    expect(text).not.toMatch(PHONE);
    const phone = s1.leadInfo[o.id]?.buyerPhone;
    if (phone) expect(text).not.toContain(phone);
  });

  it("có việc cần duyệt báo người có quyền duyệt trừ người đề xuất; duyệt xong báo người đề xuất", () => {
    const s0 = initialState();
    const order = s0.orders[0];
    const s1 = reducerWithNotify(s0, {
      type: "orderPayment",
      orderId: order.id,
      payType: "deposit",
      method: "Chuyển khoản",
      amount: 10_000_000,
      reference: "",
      actorId: "u-minh",
      actor: "Minh",
    });
    const needed = s1.tgOutbox.filter((n) => n.event === "approval_needed").map((n) => n.to);
    expect(needed).toContain("Hà");
    expect(needed).not.toContain("Minh");
    expect(needed).not.toContain("Thảo");
    const q = s1.queue.find((x) => x.kind === "order_payment")!;
    const s2 = reducerWithNotify(s1, { type: "approve", id: q.id, ok: true, actor: "Hà", isOwner: true });
    const res = s2.tgOutbox.filter((n) => n.event === "approval_result");
    expect(res.map((n) => n.to)).toEqual(["Minh"]);
    expect(res[0].ok).toBe(true);
  });

  it("nhắc @tên trong nhóm báo đúng người", () => {
    const s0 = initialState();
    const s1 = reducerWithNotify(s0, {
      type: "chatSend",
      chatId: "c-tele",
      topicId: "general",
      text: "@Thảo gọi lại khách Daegu giúp chị",
      actor: "Minh",
    });
    const mention = s1.tgOutbox.filter((n) => n.event === "chat_mention");
    expect(mention.map((n) => n.to)).toEqual(["Thảo"]);
    expect(s1.tgOutbox.some((n) => n.to === "Minh")).toBe(false);
    // Tin nhóm thường mặc định tắt: Hà không thấy trong tin gửi tới mình.
    expect(notesFor(s1, "Hà").some((n) => n.event === "chat_message")).toBe(false);
  });
});

describe("quyền chỉnh thông báo", () => {
  const w = (me: string): Who => ({
    perms: new Set(["lead.view_own"]),
    me,
    userId: "u",
    isOwner: false,
    readOnly: false,
  });
  it("chỉ chỉnh được của chính mình", () => {
    const s = initialState();
    const a = {
      type: "notifyPrefs" as const,
      who: "Thảo",
      patch: { level: "detail" as const },
      actor: "Thảo",
    };
    expect(deniedReason(s, a, w("Thảo"))).toBeNull();
    expect(deniedReason(s, a, w("An"))).toBeTruthy();
    expect(deniedReason(s, { type: "notifyTest", who: "Thảo" }, w("An"))).toBeTruthy();
  });
});
