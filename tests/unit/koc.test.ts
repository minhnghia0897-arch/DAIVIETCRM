import { describe, expect, it } from "vitest";

import { kocDenied, kocReducer, type KocAction, type KocWho } from "@/lib/koc/actions";
import { kocSeed } from "@/lib/koc/data";
import { creatorStats, nextStatus, suggestCode, tierOf } from "@/lib/koc/logic";

const admin: KocWho = {
  perms: new Set(["marketing.manage", "payment.confirm"]),
  isOwner: false,
  readOnly: false,
};
const owner: KocWho = { ...admin, isOwner: true };
const telesale: KocWho = { perms: new Set(["lead.view_own"]), isOwner: false, readOnly: false };
const meta = { actor: "u-admin", at: "2026-10-04T03:00:00Z" };

function run(data = kocSeed(), a: KocAction, who = admin) {
  const why = kocDenied(data, a, who);
  return { why, data: why ? data : kocReducer(data, a) };
}

describe("chỉ số KOL, KOC", () => {
  it("tính chi phí, hoa hồng, doanh thu, chi phí mỗi lead và còn phải trả", () => {
    const s = creatorStats(kocSeed(), "koc-ansan");
    // 2 booking không hủy, chỉ booking đã thanh toán và booking đã duyệt kịch bản tính phí.
    expect(s.fees).toBe(15_000_000);
    expect(s.leads).toBe(9);
    expect(s.orders).toBe(3);
    expect(s.revenue).toBe(79_900_000 * 2 + 49_900_000);
    // Hoa hồng 3% trên đơn hoàn tất.
    expect(s.commission).toBe(Math.round(209_700_000 * 0.03));
    expect(s.cost).toBe(15_000_000 + 6_291_000);
    expect(s.cpl).toBe(Math.round(21_291_000 / 9));
    // Đã nghiệm thu trở đi: 6tr phí + hoa hồng, đã trả 6tr.
    expect(s.owed).toBe(6_291_000);
    expect(s.roas).toBeCloseTo(209_700_000 / 21_291_000);
  });

  it("tiếp thị liên kết chỉ có hoa hồng theo hợp đồng", () => {
    const s = creatorStats(kocSeed(), "aff-tuan");
    expect(s.fees).toBe(0);
    expect(s.commission).toBe(Math.round(49_900_000 * 0.05));
    expect(s.cpo).toBe(s.commission);
  });

  it("chưa có lead, đơn thì chỉ số để trống chứ không chia cho 0", () => {
    const s = creatorStats(kocSeed(), "koc-ngoc");
    expect(s.cpl).toBeNull();
    expect(s.roas).toBeNull();
  });

  it("hạng theo số người theo dõi và mã giới thiệu không trùng", () => {
    expect(tierOf(9_000)).toMatch(/^Nano/);
    expect(tierOf(48_200)).toMatch(/^Micro/);
    expect(tierOf(520_000)).toMatch(/^Macro/);
    expect(suggestCode("Chị Hạnh Daegu", new Set(["CHIHANHD"]))).toBe("CHIHANHD2");
  });
});

describe("bước booking", () => {
  it("trong hạn mức thì chốt thẳng, vượt mức thì chờ Owner duyệt", () => {
    expect(nextStatus({ status: "proposed", fee: 3_000_000 })).toBe("confirmed");
    expect(nextStatus({ status: "proposed", fee: 25_000_000 })).toBe("budget_pending");
    const { why } = run(undefined, { type: "advanceBooking", id: "bk-04", ...meta }, admin);
    expect(why).toMatch(/Owner duyệt ngân sách/);
    const ok = run(undefined, { type: "advanceBooking", id: "bk-04", ...meta }, owner);
    expect(ok.why).toBeNull();
    const b = ok.data.bookings.find((x) => x.id === "bk-04")!;
    expect(b.status).toBe("confirmed");
    expect(b.approvedBy).toBe("u-admin");
  });

  it("không ghi đã đăng khi chưa có link, không nghiệm thu khi chưa có lượt xem", () => {
    // bk-02 đang Đã duyệt kịch bản, chưa có bài.
    expect(run(undefined, { type: "advanceBooking", id: "bk-02", ...meta }).why).toMatch(/link bài/);
    const withPost = run(undefined, {
      type: "addPost",
      bookingId: "bk-02",
      post: {
        url: "https://www.tiktok.com/@vochongansan/live/1",
        platform: "tiktok",
        postedAt: meta.at,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
      },
      ...meta,
    }).data;
    const posted = run(withPost, { type: "advanceBooking", id: "bk-02", ...meta });
    expect(posted.why).toBeNull();
    expect(run(posted.data, { type: "advanceBooking", id: "bk-02", ...meta }).why).toMatch(/lượt xem/);
  });

  it("chỉ ghi đã thanh toán khi đã trả đủ phí", () => {
    // bk-05 đã nghiệm thu, mới trả 15tr trên 30tr.
    expect(run(undefined, { type: "advanceBooking", id: "bk-05", ...meta }).why).toMatch(/Mới ghi trả/);
    const paid = run(undefined, {
      type: "recordPayout",
      payout: {
        creatorId: "kol-mehien",
        bookingId: "bk-05",
        kind: "fee",
        amount: 15_000_000,
        reference: "CK đợt 2",
      },
      ...meta,
    }).data;
    expect(run(paid, { type: "advanceBooking", id: "bk-05", ...meta }).why).toBeNull();
  });

  it("không đặt booking mới cho người đang tạm dừng, không hủy booking đã đăng", () => {
    const draft = {
      creatorId: "koc-lam",
      campaign: "Thử lại",
      products: [],
      format: "short_video" as const,
      postAt: meta.at,
      fee: 1,
      commissionRate: 0,
      note: "",
    };
    expect(run(undefined, { type: "addBooking", booking: draft, ...meta }).why).toMatch(/tạm dừng/);
    expect(run(undefined, { type: "cancelBooking", id: "bk-01", reason: "x", ...meta }).why).toMatch(
      /đã đăng/,
    );
  });
});

describe("quyền", () => {
  it("người không có quyền, đang xem như, không ghi được gì", () => {
    const a: KocAction = { type: "addNote", id: "koc-ansan", text: "x", ...meta };
    expect(kocDenied(kocSeed(), a, telesale)).toMatch(/chưa được cấp quyền/);
    expect(kocDenied(kocSeed(), a, { ...owner, readOnly: true })).toMatch(/chỉ đọc/);
  });

  it("ghi tiền trả cần quyền xác nhận thanh toán", () => {
    const a: KocAction = {
      type: "recordPayout",
      payout: { creatorId: "koc-ansan", bookingId: null, kind: "commission", amount: 1, reference: "CK" },
      ...meta,
    };
    expect(kocDenied(kocSeed(), a, { ...admin, perms: new Set(["marketing.manage"]) })).toMatch(
      /xác nhận thanh toán/,
    );
    expect(kocDenied(kocSeed(), a, admin)).toBeNull();
  });

  it("mã giới thiệu phải hợp lệ và không trùng", () => {
    const base = kocSeed().creators[0];
    const a = (code: string): KocAction => ({
      type: "addCreator",
      creator: { ...base, trackingCode: code },
      ...meta,
    });
    expect(kocDenied(kocSeed(), a("ANSAN"), admin)).toMatch(/đã có người dùng/);
    expect(kocDenied(kocSeed(), a("ab"), admin)).toMatch(/3 đến 12/);
    expect(kocDenied(kocSeed(), a("MOI2026"), admin)).toBeNull();
  });
});

describe("hợp đồng và tệp hợp đồng", () => {
  const file = {
    name: "phu-luc.pdf",
    kind: "appendix" as const,
    size: 200_000,
    mime: "application/pdf",
    url: null,
  };

  it("tải lên tệp PDF, gỡ được; chặn tệp lạ, tệp quá 10MB", () => {
    const up = run(undefined, { type: "addContractFile", id: "koc-ansan", file, ...meta });
    expect(up.why).toBeNull();
    const files = up.data.creators.find((c) => c.id === "koc-ansan")!.contract!.files;
    expect(files.map((f) => f.name)).toEqual(["phu-luc.pdf", "hop-dong-vo-chong-ansan.pdf"]);
    expect(files[0].uploadedBy).toBe("u-admin");

    expect(
      run(undefined, {
        type: "addContractFile",
        id: "koc-ansan",
        file: { ...file, mime: "application/zip" },
        ...meta,
      }).why,
    ).toMatch(/PDF/);
    expect(
      run(undefined, {
        type: "addContractFile",
        id: "koc-ansan",
        file: { ...file, size: 11 * 1024 * 1024 },
        ...meta,
      }).why,
    ).toMatch(/10MB/);

    const gone = run(up.data, {
      type: "removeContractFile",
      id: "koc-ansan",
      fileId: files[0].id,
      ...meta,
    }).data;
    expect(gone.creators.find((c) => c.id === "koc-ansan")!.contract!.files).toHaveLength(1);
  });

  it("chưa có hợp đồng thì tạo trước rồi mới tải tệp; giữ tệp khi sửa hợp đồng", () => {
    expect(run(undefined, { type: "addContractFile", id: "kol-seoul", file, ...meta }).why).toMatch(
      /Tạo hợp đồng trước/,
    );
    const contract = {
      code: "HĐ-KOL-2610-01",
      status: "draft" as const,
      startsOn: "2026-10-04",
      endsOn: "2027-04-04",
      commissionRate: 2,
      usageRightsMonths: 6,
      exclusivity: null,
    };
    expect(
      run(undefined, {
        type: "setContract",
        id: "kol-seoul",
        contract: { ...contract, endsOn: "2026-01-01" },
        ...meta,
      }).why,
    ).toMatch(/Ngày kết thúc/);
    const made = run(undefined, { type: "setContract", id: "kol-seoul", contract, ...meta }).data;
    const withFile = run(made, { type: "addContractFile", id: "kol-seoul", file, ...meta }).data;
    const edited = run(withFile, {
      type: "setContract",
      id: "kol-seoul",
      contract: { ...contract, status: "signed" },
      ...meta,
    }).data;
    const k = edited.creators.find((c) => c.id === "kol-seoul")!.contract!;
    expect(k.status).toBe("signed");
    expect(k.files).toHaveLength(1);
  });

  it("người không có quyền quản lý không tải lên được", () => {
    expect(
      kocDenied(kocSeed(), { type: "addContractFile", id: "koc-ansan", file, ...meta }, telesale),
    ).toMatch(/chưa được cấp quyền/);
  });
});
