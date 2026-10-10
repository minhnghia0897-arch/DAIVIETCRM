import { describe, expect, it } from "vitest";

import {
  deniedReason,
  replyBlocker,
  visibleConvs,
  visibleHouses,
  visibleOpps,
  visibleQueue,
  type Who,
} from "@/components/crm/access";
import { initialState, reducer, type CrmAction, type CrmState } from "@/components/crm/store";
import { PERMISSIONS, type RoleKey } from "@/lib/auth/permissions";

// Lớp kiểm quyền của bản demo (CLAUDE.md mục 5): mọi thao tác bị kiểm lại trước khi đổi dữ liệu,
// phạm vi xem theo quyền chứ không theo tên vai trò.

const ids: Record<RoleKey, string> = {
  owner: "11111111-1111-4111-8111-000000000001",
  sale_admin: "11111111-1111-4111-8111-000000000002",
  telesale: "11111111-1111-4111-8111-000000000003",
  marketing: "11111111-1111-4111-8111-000000000005",
};
const names: Record<RoleKey, string> = {
  owner: "Hà",
  sale_admin: "Minh",
  telesale: "Thảo",
  marketing: "Lan",
};

function who(role: RoleKey, extra: Partial<Who> = {}): Who {
  const perms = new Set(PERMISSIONS.filter((p) => p.defaults.includes(role)).map((p) => p.key));
  return {
    perms,
    me: names[role],
    userId: ids[role],
    isOwner: perms.has("settings.permissions"),
    readOnly: false,
    ...extra,
  };
}

const run = (s: CrmState, a: CrmAction, w: Who) => (deniedReason(s, a, w) ? s : reducer(s, a));

describe("phạm vi xem", () => {
  const s = initialState();

  it("telesale chỉ thấy lead, hộ, hội thoại của mình", () => {
    const t = who("telesale");
    expect(visibleOpps(s, t).every((o) => o.owner === "Thảo")).toBe(true);
    const houses = new Set(visibleOpps(s, t).map((o) => o.houseId));
    expect(visibleHouses(s, t).every((h) => houses.has(h.id))).toBe(true);
    expect(visibleConvs(s, t).every((c) => c.houseId && houses.has(c.houseId))).toBe(true);
    expect(visibleConvs(s, t).length).toBeLessThan(s.convs.length);
  });

  it("sale admin thấy mọi lead và mọi hội thoại", () => {
    const a = who("sale_admin");
    expect(visibleOpps(s, a)).toHaveLength(s.opps.length);
    expect(visibleConvs(s, a)).toHaveLength(s.convs.length);
  });

  it("hàng chờ duyệt chỉ có mục mình được duyệt hoặc mình đề xuất", () => {
    const withQueue: CrmState = {
      ...s,
      queue: [
        {
          id: "q1",
          kind: "discount",
          agent: "tele",
          text: "",
          why: "",
          okText: "",
          time: "",
          perm: "order.discount_approve",
          requestedBy: "Thảo",
        },
        {
          id: "q2",
          kind: "order_payment",
          agent: "trust",
          text: "",
          why: "",
          okText: "",
          time: "",
          perm: "payment.confirm",
          requestedBy: "An",
        },
      ],
    };
    expect(visibleQueue(withQueue, who("telesale")).map((q) => q.id)).toEqual(["q1"]);
    expect(visibleQueue(withQueue, who("sale_admin")).map((q) => q.id)).toEqual(["q2"]);
    expect(visibleQueue(withQueue, who("owner"))).toHaveLength(2);
  });
});

describe("kiểm quyền từng thao tác", () => {
  it("telesale không sửa, không đánh thất bại lead của người khác", () => {
    const s = initialState();
    const other = s.opps.find((o) => o.owner && o.owner !== "Thảo")!;
    const t = who("telesale");
    expect(
      deniedReason(s, { type: "loseOpp", oppId: other.id, reason: "Giá cao", actor: "Thảo" }, t),
    ).toBeTruthy();
    expect(deniedReason(s, { type: "addNote", oppId: other.id, text: "x", actor: "Thảo" }, t)).toBeTruthy();
    const after = run(s, { type: "loseOpp", oppId: other.id, reason: "Giá cao", actor: "Thảo" }, t);
    expect(after.opps.some((o) => o.id === other.id)).toBe(true);
  });

  it("đánh thất bại cần lý do và đúng lead được chọn", () => {
    const s = { ...initialState(), oppSel: "o2" };
    const t = who("telesale");
    expect(deniedReason(s, { type: "loseOpp", oppId: "o1", reason: "", actor: "Thảo" }, t)).toBe(
      "Cần chọn lý do thất bại",
    );
    const after = run(s, { type: "loseOpp", oppId: "o1", reason: "Giá cao", actor: "Thảo" }, t);
    expect(after.opps.some((o) => o.id === "o1")).toBe(false);
    expect(after.opps.some((o) => o.id === "o2")).toBe(true);
    expect(after.closedLeads[0]).toMatchObject({ id: "o1", reason: "Giá cao" });
  });

  it("chế độ Xem như chặn mọi thao tác ghi, vẫn cho chọn trên màn hình", () => {
    const s = initialState();
    const o = who("owner", { readOnly: true });
    expect(deniedReason(s, { type: "addNote", oppId: "o1", text: "x", actor: "Hà" }, o)).toContain("chỉ đọc");
    expect(deniedReason(s, { type: "selectOpp", id: "o1" }, o)).toBeNull();
  });

  it("không ai tự duyệt đề xuất của mình, trừ Owner", () => {
    const s: CrmState = {
      ...initialState(),
      queue: [
        {
          id: "q1",
          kind: "discount",
          agent: "tele",
          text: "",
          why: "",
          okText: "",
          time: "",
          perm: "order.discount_approve",
          requestedBy: "Hà",
        },
        {
          id: "q2",
          kind: "stock_count",
          agent: "trust",
          text: "",
          why: "",
          okText: "",
          time: "",
          perm: "inventory.count_approve",
          requestedBy: "Minh",
        },
      ],
    };
    expect(
      deniedReason(s, { type: "approve", id: "q1", ok: true, actor: "Hà", isOwner: true }, who("owner")),
    ).toBeNull();
    // Sale admin không có quyền duyệt kiểm kê, dù client gửi isOwner: true.
    expect(
      deniedReason(
        s,
        { type: "approve", id: "q2", ok: true, actor: "Minh", isOwner: true },
        who("sale_admin"),
      ),
    ).toBeTruthy();
  });

  it("Giữ bất ngờ chặn xem số người nhận, kể cả người có quyền xem mọi số", () => {
    const base = initialState();
    const s: CrmState = {
      ...base,
      leadInfo: { ...base.leadInfo, o1: { ...base.leadInfo.o1, keepSurprise: true } },
    };
    expect(
      deniedReason(s, { type: "revealPhone", oppId: "o1", who: "recipient", actor: "Hà" }, who("owner")),
    ).toContain("Giữ bất ngờ");
    expect(
      deniedReason(s, { type: "revealPhone", oppId: "o1", who: "buyer", actor: "Thảo" }, who("telesale")),
    ).toBeNull();
    expect(
      deniedReason(s, { type: "revealPhone", oppId: "o2", who: "buyer", actor: "Thảo" }, who("telesale")),
    ).toBeTruthy();
  });

  it("sửa cài đặt theo đúng quyền của từng phần", () => {
    const s = initialState();
    const a = who("sale_admin");
    expect(
      deniedReason(s, { type: "setSettings", patch: { slaMinutes: 7 }, actor: "Minh", label: "" }, a),
    ).toBeNull();
    expect(
      deniedReason(s, { type: "setSettings", patch: { callMode: "provider" }, actor: "Minh", label: "" }, a),
    ).toBeTruthy();
    expect(
      deniedReason(s, { type: "setSettings", patch: { policies: [] }, actor: "Minh", label: "" }, a),
    ).toBeTruthy();
  });

  it("kênh trả lời ở công cụ khác hoặc tổng đài thì không trả lời trên CRM", () => {
    const s = initialState();
    const a = who("sale_admin");
    expect(replyBlocker(s, a, "Zalo")).toBeNull();
    expect(replyBlocker(s, a, "Facebook")).toContain("Pancake");
    expect(replyBlocker(s, a, "TikTok Live")).toContain("tắt");
    expect(replyBlocker(s, a, "Hotline")).toContain("tổng đài");
  });
});

describe("nghiệp vụ sau khi rà quyền", () => {
  it("người nhận lead lấy theo quyền lead.receive mặc định, không gồm Owner và sale admin", () => {
    const names = initialState().receivers.map((r) => r.name);
    expect(names).toContain("Thảo");
    expect(names).not.toContain("Hà");
    expect(names).not.toContain("Minh");
  });

  it("lead đã giao lắp xong thì khách hỏi lại được tạo lead mới", () => {
    const base = initialState();
    const won = { ...base.opps[0], id: "w1", stage: 5 };
    const s: CrmState = {
      ...base,
      opps: [won, ...base.opps.slice(1)],
      leadMeta: { ...base.leadMeta, w1: { phoneE164: "+84901234567", createdAt: 0 } },
    };
    const after = reducer(s, {
      type: "createLead",
      name: "Khách cũ",
      phoneRaw: "0901234567",
      market: "VN",
      source: "Hotline",
      product: "Chưa rõ",
      note: "",
      actor: "Minh",
    });
    expect(after.opps.length).toBe(s.opps.length + 1);
  });

  it("hoàn tác giữ nguyên nhật ký kiểm toán và ghi thêm dòng hoạt động", () => {
    const before = initialState();
    const audited = reducer(before, {
      type: "audit",
      actor: "Thảo",
      action: "Xem số điện thoại",
      entity: "Lead",
      detail: "",
    });
    const restored = reducer(audited, {
      type: "restore",
      before,
      after: { type: "addNote", oppId: "o1", actor: "Thảo" },
    });
    expect(restored.audit.length).toBe(audited.audit.length);
    expect(restored.activities[0].text).toBe("Hoàn tác thao tác vừa làm");
  });
});
