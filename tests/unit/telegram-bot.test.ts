import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { telegramApi } from "@/lib/integrations/telegram_bot/api";
import { parseCommand, PURPOSES, reasonVi } from "@/lib/integrations/telegram_bot/inbound";
import { keyboardFor } from "@/lib/integrations/telegram_bot/outbound";
import { formatNotify, NOTIFY_EVENTS } from "@/lib/notify/events";

// Bộ nối Telegram thật (lib/integrations/telegram_bot): phần thuần, không gọi mạng.

describe("lệnh Telegram", () => {
  it("đọc lệnh có và không có @tên_bot", () => {
    expect(parseCommand("/start abc123", "DAIVIETS4BOT")).toEqual({ cmd: "start", arg: "abc123" });
    expect(parseCommand("/gan@DAIVIETS4BOT giaohang", "DAIVIETS4BOT")).toEqual({
      cmd: "gan",
      arg: "giaohang",
    });
    expect(parseCommand("/gan@BotKhac chung", "DAIVIETS4BOT")).toBeNull();
    expect(parseCommand("chào cả nhà", "DAIVIETS4BOT")).toBeNull();
  });

  it("công dụng nhóm", () => {
    expect(PURPOSES.giaohang).toBe("delivery");
    expect(PURPOSES.thongbao).toBe("announce");
  });

  it("lý do từ chối viết bằng tiếng Việt, không lộ lỗi kỹ thuật", () => {
    expect(reasonVi("42501", "telegram account not linked")).toContain("chưa liên kết");
    expect(reasonVi("42501", "not allowed to edit this lead")).toContain("không có quyền");
    expect(reasonVi("XX000", "boom")).not.toContain("boom");
  });
});

describe("tin gửi đi", () => {
  it("hẹn gọi lại có nút Xong, Hẹn lại; dữ liệu nút trong giới hạn 64 byte", () => {
    const rows = keyboardFor(
      {
        event: "callback_due",
        to: "u",
        at: "10:00",
        due: "10:00",
        taskId: "9c60d51f-f951-4254-a91b-fd4e1da5f07a",
        path: "/leads/x",
      },
      "short",
    );
    expect(rows[0].map((b) => b.text)).toEqual(["Xong", "Hẹn lại 1 giờ"]);
    for (const b of rows[0]) expect(new TextEncoder().encode(b.callback_data).length).toBeLessThanOrEqual(64);
  });

  it("tin lead mới không có nút mở CRM khi chưa có địa chỉ thật", () => {
    expect(keyboardFor({ event: "lead_assigned", to: "u", at: "1", path: "/leads/x" }, "detail")).toEqual([]);
  });

  it("không nhận token sai định dạng", () => {
    expect(() => telegramApi("khong-phai-token")).toThrow();
  });
});

// Giữ trang Cài đặt khớp với thực tế: công tắc nào không ghi "Sắp có" thì phải có chỗ sinh tin thật. Trước đây
// 6 trong 9 loại tin có công tắc mà không ai gửi, bật lên cũng chờ vô ích.
describe("danh mục tin khớp với bộ gửi", () => {
  const outbound = readFileSync(
    new URL("../../lib/integrations/telegram_bot/outbound.ts", import.meta.url),
    "utf8",
  );

  for (const e of NOTIFY_EVENTS) {
    it(`${e.key}: ${e.notYetLive ? "chưa chạy thì không được gửi" : "đã bật thì phải có chỗ gửi"}`, () => {
      expect(outbound.includes(`event: "${e.key}"`)).toBe(!e.notYetLive);
    });
  }
});

describe("lời tin của các loại mới", () => {
  it("lead quá hạn: mức Chi tiết có tên gọi ngắn, không có số điện thoại", () => {
    const { text } = formatNotify(
      {
        event: "sla_overdue",
        to: "u",
        at: "09:20",
        customer: "Nguyễn Thị Thu",
        market: "KR",
        due: "09:15",
        path: "/leads/x",
      },
      "detail",
    );
    expect(text).toContain("Thu (Hàn)");
    expect(text).not.toMatch(/\d{3}[ .]?\d{3,}/);
  });

  it("kết quả duyệt: nói rõ được duyệt hay bị từ chối", () => {
    const facts = { event: "approval_result", to: "u", at: "09:20", what: "Giảm giá", path: "/approvals" };
    expect(formatNotify({ ...facts, ok: true } as never, "detail").text).toContain("được duyệt");
    expect(formatNotify({ ...facts, ok: false } as never, "detail").text).toContain("từ chối");
  });

  it("đấu nối lỗi: nói rõ lead có thể chưa vào CRM", () => {
    const { text } = formatNotify(
      {
        event: "integration_error",
        to: "u",
        at: "09:20",
        integration: "Zalo OA",
        path: "/settings/integrations",
      },
      "short",
    );
    expect(text).toContain("Zalo OA");
    expect(text).toContain("lead có thể chưa vào CRM");
  });
});
