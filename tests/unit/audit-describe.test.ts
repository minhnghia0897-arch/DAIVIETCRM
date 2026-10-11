import { describe, expect, it } from "vitest";

import { auditActionLabel, auditDetail } from "@/lib/audit/describe";

describe("nhật ký kiểm toán dễ đọc", () => {
  it("tên hành động tiếng Việt, kể cả danh mục và mã chưa biết", () => {
    expect(auditActionLabel("settings.assignment_rules.update")).toBe("Sửa luật phân lead");
    expect(auditActionLabel("settings.occasions.insert")).toBe("Thêm mục dịp tặng");
    expect(auditActionLabel("shifts.insert")).toBe("Thêm ca trực");
    expect(auditActionLabel("something.unknown")).toBe("Thao tác khác");
  });

  it("chỉ nêu trường đã đổi, cũ → mới, không lộ mã nội bộ", () => {
    const d = auditDetail({
      before: { id: "1", sla_minutes: 5, max_uncontacted_per_person: 10, updated_at: "2026-10-08T09:00:00Z" },
      after: { id: "1", sla_minutes: 1, max_uncontacted_per_person: 10, updated_at: "2026-10-08T09:01:00Z" },
      showroom_id: "4a000000-0000-4000-8000-000000000004",
    });
    expect(d).toBe("hạn gọi (phút): 5 → 1");
  });

  it("thêm mục mới liệt kê nhãn; khung gọi đọc được", () => {
    expect(
      auditDetail({
        before: null,
        after: { id: "x", key: "giang_sinh", label: "Giáng sinh", sort: 9, is_active: true },
      }),
    ).toBe("mã: giang_sinh; nhãn: Giáng sinh; thứ tự: 9; đang dùng: có");
    expect(
      auditDetail({
        before: { call_windows: [{ days: [1, 2], start: "19:00", end: "22:30" }] },
        after: { call_windows: [{ days: [1, 2], start: "19:30", end: "22:30" }] },
      }),
    ).toBe("khung gọi: T2 T3 19:00–22:30 → T2 T3 19:30–22:30");
  });

  it("quyền riêng dùng tên quyền", () => {
    expect(
      auditDetail(
        { permission: "lead.create", before: null, after: "revoke" },
        { permission: (k) => (k === "lead.create" ? "Tạo lead tay" : k) },
      ),
    ).toBe("quyền: Tạo lead tay; trước: trống; sau: thu riêng");
  });

  it("giá trị mã hóa đổi sang chữ", () => {
    expect(auditDetail({ action: "created", source: "walk_in" })).toBe(
      "kết quả: khách mới; nguồn: Khách đến showroom",
    );
    expect(auditDetail({ before: { status: null }, after: { status: "not_connected" } })).toBe(
      "trạng thái: trống → chưa kết nối",
    );
  });
});
