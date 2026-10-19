import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { linkBase, telegramApi } from "@/lib/integrations/telegram_bot/api";
import {
  block,
  BOT_COMMANDS,
  isBotCommand,
  pack,
  replyWindow,
  span,
  vnDayStart,
} from "@/lib/integrations/telegram_bot/commands";
import { parseCommand, PURPOSES, reasonVi } from "@/lib/integrations/telegram_bot/inbound";
import { isChatGone, keyboardFor } from "@/lib/integrations/telegram_bot/outbound";
import { TelegramError } from "@/lib/integrations/telegram_bot/api";
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

  it("có địa chỉ CRM https thì thêm nút mở thẳng màn liên quan", () => {
    expect(
      keyboardFor(
        { event: "lead_assigned", to: "u", at: "1", path: "/leads/x" },
        "detail",
        "https://daivietcrmq4.vercel.app",
      ),
    ).toEqual([[{ text: "Mở và gọi", url: "https://daivietcrmq4.vercel.app/leads/x" }]]);
  });

  it("chỉ dùng địa chỉ https cho nút link (Telegram từ chối cả tin nếu link là localhost)", () => {
    expect(linkBase("https://daivietcrmq4.vercel.app/")).toBe("https://daivietcrmq4.vercel.app");
    expect(linkBase("http://localhost:3000")).toBeNull();
    expect(linkBase(null)).toBeNull();
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
    const facts = { event: "approval_result", to: "u", at: "09:20", what: "Giảm giá", path: "/tasks" };
    expect(formatNotify({ ...facts, ok: true } as never, "detail").text).toContain("được duyệt");
    expect(formatNotify({ ...facts, ok: false } as never, "detail").text).toContain("từ chối");
  });

  it("tin duyệt của đơn ghi số tiền, mã đơn và tên khách theo mức chi tiết", () => {
    const facts = {
      event: "approval_result",
      to: "u",
      at: "11:00",
      what: "Xác nhận tiền 6.050.000đ",
      orderCode: "Q4-2610-0008",
      customer: "Nguyễn Thị Thu 0912345678",
      ok: true,
      path: "/orders/x",
    } as const;
    expect(formatNotify(facts, "detail").text).toBe(
      "Xác nhận tiền 6.050.000đ đơn Q4-2610-0008 của Thu đã được duyệt.",
    );
    expect(formatNotify(facts, "full").text).toBe(
      "Xác nhận tiền 6.050.000đ đơn Q4-2610-0008 của Nguyễn Thị Thu đã được duyệt.",
    );
    // Mức Rút gọn không ghi tên khách, vẫn có mã đơn.
    expect(formatNotify(facts, "short").text).toBe("Đề xuất của anh chị (đơn Q4-2610-0008) đã được duyệt.");
    expect(formatNotify({ ...facts, event: "approval_needed" }, "detail").text).toBe(
      "Chờ anh chị duyệt: Xác nhận tiền 6.050.000đ đơn Q4-2610-0008 của Thu.",
    );
    expect(formatNotify(facts, "detail").buttons[0]).toMatchObject({ label: "Xem đơn", path: "/orders/x" });
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

// Một người chặn bot hay một nhóm hỏng không được làm chết cả vòng gửi tin: nhận ra đúng loại lỗi này thì thôi
// hẳn chat đó (thu hồi liên kết, đánh dấu nhóm đã rời) và đi tiếp, thay vì thử lại mỗi phút.
describe("chat không gửi được nữa", () => {
  it("bị chặn, bị đưa ra khỏi nhóm", () => {
    expect(isChatGone(new TelegramError("sendMessage", 403, "Forbidden: bot was blocked by the user"))).toBe(
      true,
    );
    expect(
      isChatGone(new TelegramError("sendMessage", 403, "Forbidden: bot was kicked from the group chat")),
    ).toBe(true);
  });

  it("nhóm không còn hoặc đã nâng cấp", () => {
    expect(isChatGone(new TelegramError("sendMessage", 400, "Bad Request: chat not found"))).toBe(true);
    expect(
      isChatGone(
        new TelegramError("sendMessage", 400, "Bad Request: group chat was upgraded to a supergroup"),
      ),
    ).toBe(true);
  });

  it("lỗi tạm thời hay lỗi khác thì không coi là mất chat", () => {
    expect(isChatGone(new TelegramError("sendMessage", 429, "Too Many Requests: retry after 5"))).toBe(false);
    expect(isChatGone(new TelegramError("sendMessage", 400, "Bad Request: message text is empty"))).toBe(
      false,
    );
    expect(isChatGone(new Error("mạng hỏng"))).toBe(false);
  });
});

describe("lệnh xem nhanh /viec /lead /giaohang /cskh", () => {
  it("menu lệnh đúng quy định của Telegram: tên chữ thường, mô tả tiếng Việt không quá 256 ký tự", () => {
    expect(BOT_COMMANDS.map((c) => c.command)).toEqual(["viec", "lead", "giaohang", "cskh"]);
    for (const c of BOT_COMMANDS) {
      expect(c.command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.description.length).toBeLessThanOrEqual(256);
    }
  });

  it("nhận lệnh gõ trong nhóm có @tên_bot", () => {
    const c = parseCommand("/cskh@DaiVietQ4Bot", "DaiVietQ4Bot");
    expect(c?.cmd).toBe("cskh");
    expect(isBotCommand(c!.cmd)).toBe(true);
    expect(isBotCommand("gan")).toBe(false);
  });

  it("đầu ngày tính theo giờ Việt Nam", () => {
    // 03:00 sáng 13/10 giờ VN là 20:00 ngày 12/10 giờ UTC; đầu ngày 13/10 giờ VN là 17:00 ngày 12/10 UTC.
    const now = new Date("2026-10-12T20:00:00Z");
    expect(vnDayStart(now).toISOString()).toBe("2026-10-12T17:00:00.000Z");
    expect(vnDayStart(now, 1).toISOString()).toBe("2026-10-13T17:00:00.000Z");
  });
});

describe("lệnh xem nhanh: dựng tin theo mức chi tiết", () => {
  const extra = ["Ngân sách 30–50tr · nhận ở Cần Thơ", "đã liên hệ 2 lần", null, "", "Còn thiếu: dịp mua"];

  it("Rút gọn chỉ dòng chính; Chi tiết thêm dòng quan trọng nhất; Đầy đủ thêm hết, bỏ dòng rỗng", () => {
    expect(block("short", "1. Mới", extra)).toBe("1. Mới");
    expect(block("detail", "1. Mới", extra)).toBe("1. Mới\n   Ngân sách 30–50tr · nhận ở Cần Thơ");
    expect(block("full", "1. Mới", extra).split("\n")).toEqual([
      "1. Mới",
      "   Ngân sách 30–50tr · nhận ở Cần Thơ",
      "   Đã liên hệ 2 lần",
      "   Còn thiếu: dịp mua",
    ]);
  });

  it("tin dài thì dừng trước giới hạn 4096 ký tự của Telegram và ghi còn bao nhiêu mục", () => {
    const blocks = Array.from({ length: 15 }, (_, i) => block("full", `${i + 1}. Mục`, ["x".repeat(400)]));
    const { text, shown } = pack("Đầu tin", blocks, 40, "full");
    expect(text.length).toBeLessThan(4096);
    expect(shown).toBeLessThan(15);
    expect(text).toContain(`còn ${40 - shown} nữa`);
  });

  it("mức Rút gọn nhắc cách đổi mức để thấy tên khách", () => {
    expect(pack("Đầu", ["1. Mới"], 1, "short").text).toContain("Cài đặt → Thông báo Telegram");
    expect(pack("Đầu", ["1. Mới"], 1, "full").text).not.toContain("Cài đặt");
  });

  it("khoảng thời gian dễ đọc", () => {
    expect(span(40 * 60_000)).toBe("40 phút");
    expect(span(3 * 3_600_000)).toBe("3 giờ");
    expect(span(3 * 86_400_000)).toBe("3 ngày");
  });

  it("còn bao lâu được nhắn: Messenger 24 giờ, Zalo miễn phí 48 giờ", () => {
    const now = new Date("2026-10-14T10:00:00Z");
    const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
    expect(replyWindow("messenger", ago(1), now)).toBe("Còn 23 giờ để trả lời qua Messenger");
    expect(replyWindow("messenger", ago(25), now)).toContain("gọi điện");
    expect(replyWindow("zalo", ago(24), now)).toBe("Còn 24 giờ nhắn Zalo miễn phí");
    expect(replyWindow("zalo", ago(50), now)).toContain("tính phí");
  });
});
