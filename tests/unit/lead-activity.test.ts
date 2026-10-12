import { describe, expect, it } from "vitest";

import { describeEvent } from "@/lib/leads/activity";

const ctx = { names: new Map([["u1", "Thảo"]]), now: new Date("2026-10-06T03:00:00Z") };

describe("dòng hoạt động của lead", () => {
  it("cuộc gọi ghi kênh, kết quả, ghi chú và giờ hẹn", () => {
    expect(
      describeEvent(
        "call",
        {
          channel: "zalo",
          outcome_label: "Hẹn gọi lại",
          note: "Khách đang bận",
          callback_at: "2026-10-06T10:00:00Z",
        },
        ctx,
      ),
    ).toEqual({ kind: "Cuộc gọi", text: "Zalo: Hẹn gọi lại. Khách đang bận. Hẹn gọi lại 17:00" });
  });

  it("giao lead dùng tên người, trả về hàng chung nêu lý do", () => {
    expect(describeEvent("assignment", { to: "u1" }, ctx).text).toBe("Giao cho Thảo");
    expect(describeEvent("assignment", { to: null, reason: "user_locked" }, ctx).text).toBe(
      "Trả về hàng Chưa phân (người giữ bị khóa tài khoản)",
    );
  });

  it("khách đang hỏi: chuyển thành lead, giao hội thoại, lead tin nhắn đưa về khách đang hỏi", () => {
    expect(describeEvent("lead_qualified", { channel: "messenger" }, ctx)).toEqual({
      kind: "Lead mới",
      text: "Chuyển từ hội thoại Messenger thành lead",
    });
    expect(describeEvent("lead_qualified", { channel: "zalo" }, ctx).text).toBe(
      "Chuyển từ hội thoại Zalo OA thành lead",
    );
    expect(describeEvent("conversation_assignment", { to: "u1", reason: "auto" }, ctx).text).toBe(
      "Giao hội thoại cho Thảo (người đang trực)",
    );
    expect(describeEvent("conversation_assignment", { to: null }, ctx).text).toBe(
      "Bỏ người phụ trách hội thoại",
    );
    expect(describeEvent("lead_reverted", {}, ctx).text).toBe(
      "Lead tự tạo từ tin nhắn được đưa về khách đang hỏi",
    );
  });

  it("ghi chú từ Telegram kèm ảnh", () => {
    expect(describeEvent("note", { channel: "telegram", file: "a/b.jpg" }, ctx)).toEqual({
      kind: "Ghi chú",
      text: "Ảnh đính kèm (gửi từ Telegram)",
      file: "a/b.jpg",
    });
  });

  it("giai đoạn đổi sang nhãn tiếng Việt", () => {
    expect(describeEvent("stage_change", { from: "new", to: "contacted" }, ctx).text).toBe(
      "Mới → Đã liên hệ",
    );
  });

  it("chống trùng nêu lý do gộp, lead cũ ghi là khách liên hệ lại", () => {
    expect(describeEvent("merge", { reason: "open_lead", matched_by: "phone" }, ctx)).toEqual({
      kind: "Chống trùng",
      text: "Khách đã có lead đang mở, ghi vào lead này thay vì tạo lead mới",
    });
    expect(describeEvent("lead_created", { source: "import", attached: true }, ctx).text).toMatch(
      /^Khách liên hệ lại từ /,
    );
  });

  it("quá hạn gọi nêu số phút trễ và người đang giữ", () => {
    expect(describeEvent("sla_breached", { late_minutes: 4, assigned_to: "u1" }, ctx)).toEqual({
      kind: "Quá hạn gọi",
      text: "Chưa gọi khi hết hạn, trễ 4 phút (Thảo đang giữ)",
    });
  });
});
