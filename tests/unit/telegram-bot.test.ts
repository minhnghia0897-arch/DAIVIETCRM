import { describe, expect, it } from "vitest";

import { telegramApi } from "@/lib/integrations/telegram_bot/api";
import { parseCommand, PURPOSES, reasonVi } from "@/lib/integrations/telegram_bot/inbound";
import { keyboardFor } from "@/lib/integrations/telegram_bot/outbound";

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
