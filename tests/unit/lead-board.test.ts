import { describe, expect, it } from "vitest";

import { boardSlaBadge, slaBadge } from "@/lib/leads/sla-badge";
import { manualTargets, missingInfo, moveBlockReason } from "@/lib/leads/stages";

// Bảng Kanban lead (12/10/2026): chỉ kéo tay được những bước CLAUDE.md mục 6 cho phép.

describe("kéo lead giữa các cột", () => {
  it("Mới → Đã liên hệ → Demo kéo tay được; thất bại từ các giai đoạn còn tư vấn", () => {
    expect(manualTargets("new")).toEqual(["contacted", "demo", "lost"]);
    expect(manualTargets("contacted")).toEqual(["demo", "lost"]);
    expect(manualTargets("demo")).toEqual(["lost"]);
    expect(manualTargets("quoted")).toEqual(["lost"]);
    expect(manualTargets("deposit")).toEqual([]);
    expect(manualTargets("won")).toEqual([]);
    expect(moveBlockReason("new", "contacted")).toBeNull();
    expect(moveBlockReason("demo", "demo")).toBeNull();
  });

  it("báo giá, cọc, chốt chỉ sinh từ báo giá và đơn; không kéo lùi; lead đã đóng đứng yên", () => {
    expect(moveBlockReason("demo", "quoted")).toContain("gửi báo giá đầu tiên");
    expect(moveBlockReason("quoted", "deposit")).toContain("tiền cọc được xác nhận");
    expect(moveBlockReason("deposit", "won")).toContain("đơn hoàn tất");
    expect(moveBlockReason("demo", "new")).toContain("Không kéo lùi");
    expect(moveBlockReason("lost", "new")).toContain("đã đóng");
    expect(moveBlockReason("deposit", "lost")).toContain("hủy đơn");
  });

  it("bốn thông tin bắt buộc còn thiếu", () => {
    expect(
      missingInfo({
        recipient_contact_id: "x",
        recipient_province: null,
        occasion_id: "o",
        budget_range_id: null,
      }),
    ).toEqual(["tỉnh người nhận", "ngân sách"]);
  });
});

describe("nhãn hạn gọi", () => {
  const now = new Date("2026-10-12T03:00:00Z");
  const base = {
    stage: "new",
    window_wait_until: null,
    first_contact_at: null,
    assigned_to: "u1",
    sla_due_at: null,
  };
  const kr = { country_code: "KR", name: "Hàn Quốc", timezone: "Asia/Seoul" };

  it("chờ khung gọi theo giờ thị trường khách; đã liên hệ; chưa phân; còn, quá hạn", () => {
    expect(slaBadge({ ...base, window_wait_until: "2026-10-12T10:00:00Z" }, kr, now)).toEqual({
      tone: "ai",
      text: "Gọi lúc 19:00 giờ Hàn Quốc",
    });
    expect(slaBadge({ ...base, first_contact_at: "2026-10-12T02:00:00Z" }, undefined, now)?.text).toBe(
      "Đã liên hệ",
    );
    expect(slaBadge({ ...base, assigned_to: null }, undefined, now)?.text).toBe("Chưa phân");
    expect(slaBadge({ ...base, sla_due_at: "2026-10-12T03:04:00Z" }, undefined, now)).toEqual({
      tone: "n",
      text: "Còn 4 phút",
    });
    expect(slaBadge({ ...base, sla_due_at: "2026-10-12T02:50:00Z" }, undefined, now)).toEqual({
      tone: "err",
      text: "Quá 10 phút",
    });
    expect(slaBadge({ ...base, stage: "won" }, undefined, now)).toBeNull();
  });

  it("bảng theo giai đoạn bỏ nhãn Đã liên hệ, vẫn giữ nhãn còn phải gọi", () => {
    expect(boardSlaBadge({ ...base, first_contact_at: "2026-10-12T02:00:00Z" }, undefined, now)).toBeNull();
    expect(boardSlaBadge({ ...base, assigned_to: null }, undefined, now)?.text).toBe("Chưa phân");
    expect(boardSlaBadge({ ...base, sla_due_at: "2026-10-12T02:50:00Z" }, undefined, now)?.text).toBe(
      "Quá 10 phút",
    );
  });
});
