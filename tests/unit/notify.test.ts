import { describe, expect, it } from "vitest";

import { deniedReason, type Who } from "@/components/crm/access";
import { planTgReply, tgTarget } from "@/components/crm/telegram-in";
import { initialState, notesFor, reducerWithNotify, type CrmState } from "@/components/crm/store";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  defaultPrefs,
  eventsFor,
  formatNotify,
  inQuietHours,
  pickKnownEvents,
  shortCustomer,
} from "@/lib/notify/events";

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

describe("ghi ngược từ Telegram vào CRM", () => {
  const tele: Who = {
    perms: new Set(PERMISSIONS.filter((p) => p.defaults.includes("telesale")).map((p) => p.key)),
    me: "Thảo",
    userId: "11111111-1111-4111-8111-000000000003",
    isOwner: false,
    readOnly: false,
  };
  const withTest = () => reducerWithNotify(initialState(), { type: "notifyTest", who: "Thảo" });
  const noteOf = (s: CrmState, ev: string) => s.tgOutbox.find((n) => n.to === "Thảo" && n.event === ev)!;
  const reply = (s: CrmState, extra: Partial<Parameters<typeof planTgReply>[1]>) =>
    ({
      type: "tgReply" as const,
      who: "Thảo",
      actor: "Thảo",
      actorId: tele.userId,
      text: "",
      ...extra,
    }) as const;

  it("trả lời tin lead thành ghi chú trên hồ sơ, số điện thoại bị che", () => {
    const s0 = withTest();
    const n = noteOf(s0, "lead_assigned");
    const a = reply(s0, { replyTo: n.id, text: "Khách hẹn 21h gọi lại, số mới 0912 345 678" });
    expect(deniedReason(s0, a, tele)).toBeNull();
    const s1 = reducerWithNotify(s0, a);
    const oppId = tgTarget(n.path).oppId!;
    const act = s1.activities.find((x) => x.oppId === oppId && x.kind === "note")!;
    expect(act.text).toContain("Qua Telegram");
    expect(act.text).toContain("091•••678");
    expect(act.text).not.toContain("345 678");
    expect(s1.tgChat[0]).toMatchObject({ from: "bot", to: "Thảo" });
    expect(s1.tgChat[0].text).toContain("Đã lưu ghi chú");
  });

  it("ảnh chuyển khoản kèm số tiền vào tin đơn thành khoản chờ xác nhận, báo người duyệt", () => {
    const s0 = withTest();
    const n = noteOf(s0, "order_status");
    const orderId = tgTarget(n.path).orderId!;
    const before = s0.orders.find((o) => o.id === orderId)!.payments.length;
    const a = reply(s0, { replyTo: n.id, photo: "ck.jpg", amount: 5_000_000, text: "" });
    expect(deniedReason(s0, a, tele)).toBeNull();
    const s1 = reducerWithNotify(s0, a);
    const pays = s1.orders.find((o) => o.id === orderId)!.payments;
    expect(pays).toHaveLength(before + 1);
    expect(pays.at(-1)).toMatchObject({ amount: 5_000_000, status: "recorded" });
    expect(s1.tgOutbox.some((x) => x.event === "approval_needed" && x.to === "Hà")).toBe(true);
  });

  it("ảnh không kèm số tiền thì bot hỏi lại, không ghi gì", () => {
    const s0 = withTest();
    const n = noteOf(s0, "order_status");
    const plan = planTgReply(s0, reply(s0, { replyTo: n.id, photo: "ck.jpg" }));
    expect(plan.action).toBeUndefined();
    expect(plan.bot).toContain("số tiền");
  });

  it("người khác không trả lời thay được; tin không gắn hồ sơ thì không lưu", () => {
    const s0 = withTest();
    const n = noteOf(s0, "lead_assigned");
    expect(deniedReason(s0, { ...reply(s0, { replyTo: n.id, text: "x" }), who: "An" }, tele)).toBeTruthy();
    const plan = planTgReply(s0, reply(s0, { text: "chào bot" }));
    expect(plan.action).toBeUndefined();
  });

  it("/viec liệt kê việc đang mở của chính mình", () => {
    const plan = planTgReply(initialState(), {
      who: "Thảo",
      actorId: tele.userId,
      text: "/viec",
    });
    expect(plan.bot).toMatch(/Việc hôm nay|không còn việc/);
  });
});

// Bản vá bật tắt sự kiện gửi từ trang Cài đặt: nhận một sự kiện hay cả bộ đều phải hiểu, và không để lọt khóa lạ
// vào cột `events` của notification_prefs.
describe("pickKnownEvents", () => {
  it("giữ bản vá một sự kiện", () => {
    expect(pickKnownEvents({ sla_overdue: false })).toEqual({ sla_overdue: false });
  });

  it("giữ cả bộ", () => {
    const all = defaultPrefs().events;
    expect(pickKnownEvents(all)).toEqual(all);
  });

  it("bỏ khóa lạ và giá trị không phải bật tắt", () => {
    expect(pickKnownEvents({ sla_overdue: true, khong_co_that: true, chat_message: "x" })).toEqual({
      sla_overdue: true,
    });
  });

  it("đầu vào không phải đối tượng thì trả bộ rỗng", () => {
    expect(pickKnownEvents(null)).toEqual({});
    expect(pickKnownEvents([1, 2])).toEqual({});
  });
});

// Mức "Đầy đủ": đủ để nắm tình huống mà không mở CRM, nhưng vẫn không có số điện thoại hay địa chỉ chi tiết
// (CLAUDE.md mục 5, 12).
describe("mức Đầy đủ", () => {
  const facts = {
    event: "lead_assigned" as const,
    to: "Thảo",
    at: "09:13",
    customer: "Nguyễn Thị Thu",
    market: "KR",
    due: "09:17",
    path: "/leads/x",
    source: "Form quảng cáo Facebook",
    budget: "50–80tr",
    occasion: "Mừng thọ · 20/10",
    recipientProvince: "Nghệ An",
    keepSurprise: true,
    attempts: 0,
    callWindow: "19:00–22:30 giờ Hàn Quốc",
    missing: ["ngân sách"],
  };

  it("có đủ thứ telesale cần để gọi", () => {
    const { text } = formatNotify(facts, "full");
    for (const phần of [
      "Thu (Hàn)",
      "Form quảng cáo Facebook",
      "50–80tr",
      "Mừng thọ · 20/10",
      "Nghệ An",
      "Giữ bất ngờ",
      "19:00–22:30 giờ Hàn Quốc",
      "Chưa liên hệ lần nào",
      "Còn thiếu: ngân sách",
    ])
      expect(text).toContain(phần);
  });

  it("không có số điện thoại", () => {
    expect(formatNotify({ ...facts, customer: "Thu 0912345678" }, "full").text).not.toMatch(
      /\d{3}[ .-]?\d{3,}/,
    );
  });

  it("mức Rút gọn và Chi tiết không kèm tóm tắt", () => {
    expect(formatNotify(facts, "short").text).not.toContain("Nguồn:");
    expect(formatNotify(facts, "detail").text).not.toContain("Nguồn:");
  });

  it("thiếu dữ liệu thì bỏ dòng đó, không in dòng trống", () => {
    const { text } = formatNotify(
      { event: "sla_overdue", to: "Thảo", at: "09:30", due: "09:17", path: "/leads/x", attempts: 2 },
      "full",
    );
    expect(text).toContain("Đã liên hệ 2 lần");
    expect(text).not.toContain("Nguồn:");
    expect(text).not.toMatch(/\n\n/);
  });
});
