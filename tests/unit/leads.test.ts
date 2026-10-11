import { describe, expect, it } from "vitest";

import { pickAssignee, routeLead, type Receiver } from "@/lib/leads/assign";
import { decideIntake, type KnownContact, type KnownLead } from "@/lib/leads/dedupe";
import { parseCsv, validateImport } from "@/lib/leads/import";
import { isInWindow, nextWindowStart, weeklyWindows } from "@/lib/leads/windows";

const KR = weeklyWindows("Asia/Seoul", ["19:00", "22:30"], ["09:00", "22:30"]);
const VN = weeklyWindows("Asia/Ho_Chi_Minh", ["08:30", "20:30"], ["09:00", "17:00"]);

describe("khung gọi theo thị trường", () => {
  it("lead Hàn lúc 10:00 sáng giờ VN ngày thường phải chờ tới 19:00 giờ Hàn", () => {
    const at = new Date("2026-10-06T10:00:00+07:00"); // Thứ Ba
    expect(isInWindow(at, KR)).toBe(false);
    expect(nextWindowStart(at, KR)?.toISOString()).toBe(new Date("2026-10-06T19:00:00+09:00").toISOString());
  });

  it("đang trong khung thì trả lại chính thời điểm đó", () => {
    const at = new Date("2026-10-06T20:15:00+09:00");
    expect(isInWindow(at, KR)).toBe(true);
    expect(nextWindowStart(at, KR)).toEqual(at);
  });

  it("sau 22:30 giờ Hàn tối thứ Sáu chuyển sang 09:00 sáng thứ Bảy (khung cuối tuần)", () => {
    const at = new Date("2026-10-09T23:00:00+09:00");
    expect(nextWindowStart(at, KR)?.toISOString()).toBe(new Date("2026-10-10T09:00:00+09:00").toISOString());
  });

  it("Chủ nhật VN ngoài 17:00 thì sang 08:30 thứ Hai", () => {
    const at = new Date("2026-10-04T18:00:00+07:00");
    expect(nextWindowStart(at, VN)?.toISOString()).toBe(new Date("2026-10-05T08:30:00+07:00").toISOString());
  });

  it("không có khung nào thì trả null", () => {
    expect(nextWindowStart(new Date(), { timezone: "Asia/Seoul", windows: {} })).toBeNull();
  });
});

const r = (id: string, over: Partial<Receiver> = {}): Receiver => ({
  id,
  canReceive: true,
  active: true,
  onDuty: true,
  absent: false,
  uncontacted: 0,
  ...over,
});

describe("phân lead vòng tròn", () => {
  it("lần lượt theo vòng, quay lại đầu", () => {
    const list = [r("a"), r("b"), r("c")];
    expect(pickAssignee(list, null, 5)?.id).toBe("a");
    expect(pickAssignee(list, "a", 5)?.id).toBe("b");
    expect(pickAssignee(list, "c", 5)?.id).toBe("a");
  });

  it("bỏ qua người không có quyền nhận, đã khóa, không trực, đang nghỉ, quá N lead chưa gọi", () => {
    const list = [
      r("a", { canReceive: false }),
      r("b", { active: false }),
      r("c", { onDuty: false }),
      r("d", { absent: true }),
      r("e", { uncontacted: 5 }),
      r("f"),
    ];
    expect(pickAssignee(list, null, 5)?.id).toBe("f");
    expect(pickAssignee(list.slice(0, 5), null, 5)).toBeNull();
  });

  it("ngoài khung thì chờ, trong khung thì giao và đặt SLA, không ai trực thì vào hàng chưa phân", () => {
    const base = { receivers: [r("a")], lastAssignedId: null, maxUncontacted: 8, slaMinutes: 5 };
    const wait = routeLead({ ...base, at: new Date("2026-10-06T10:00:00+07:00"), market: KR });
    expect(wait.kind).toBe("wait");

    const at = new Date("2026-10-06T19:05:00+07:00"); // 21:05 giờ Hàn
    const ok = routeLead({ ...base, at, market: KR });
    expect(ok).toEqual({ kind: "assigned", assigneeId: "a", slaDueAt: new Date(at.getTime() + 5 * 60_000) });

    const none = routeLead({ ...base, receivers: [r("a", { onDuty: false })], at, market: KR });
    expect(none.kind).toBe("unassigned");

    // Không rõ thị trường: giao ngay.
    expect(routeLead({ ...base, at: new Date("2026-10-06T03:00:00+07:00"), market: null }).kind).toBe(
      "assigned",
    );
  });
});

describe("chống trùng", () => {
  const contacts: KnownContact[] = [
    {
      id: "c1",
      identities: [
        { type: "phone", value: "+821012345678" },
        { type: "zalo_user_id", value: "z1" },
      ],
    },
    { id: "c2", identities: [{ type: "phone", value: "+84912345678" }] },
    { id: "c3", identities: [{ type: "phone", value: "+84900000001" }] },
    { id: "c4", identities: [{ type: "fb_psid", value: "fb4" }] },
  ];
  const now = new Date("2026-10-04T10:00:00+07:00");
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const leads: KnownLead[] = [
    { id: "l1", contactId: "c1", stage: "contacted" },
    { id: "l2", contactId: "c2", stage: "lost", closedAt: days(45) },
    { id: "l3", contactId: "c3", stage: "lost", closedAt: days(10) },
    { id: "l4", contactId: "c4", stage: "won", closedAt: days(100) },
  ];

  it("số mới hoàn toàn thì tạo khách mới", () => {
    expect(decideIntake([{ type: "phone", value: "+84999999999" }], now, contacts, leads)).toEqual({
      action: "new_contact",
    });
  });

  it("có lead đang mở thì không tạo lead mới", () => {
    expect(decideIntake([{ type: "phone", value: "+821012345678" }], now, contacts, leads)).toMatchObject({
      action: "attach_open",
      leadId: "l1",
      matchedBy: "phone",
    });
  });

  it("khách cho thêm số VN cùng Zalo cũ: nhận ra cùng khách qua Zalo", () => {
    const d = decideIntake(
      [
        { type: "phone", value: "+84911111111" },
        { type: "zalo_user_id", value: "z1" },
      ],
      now,
      contacts,
      leads,
    );
    expect(d).toMatchObject({ action: "attach_open", contactId: "c1", matchedBy: "zalo_user_id" });
  });

  it("lead cũ thất bại hơn 30 ngày hoặc đã thành công thì tạo lead mới cho cùng khách", () => {
    expect(decideIntake([{ type: "phone", value: "+84912345678" }], now, contacts, leads)).toMatchObject({
      action: "new_lead",
      contactId: "c2",
      previousLeadId: "l2",
    });
    const won = decideIntake(
      [
        { type: "fb_psid", value: "fb4" },
        { type: "phone", value: "+84933333333" },
      ],
      now,
      contacts,
      leads,
    );
    expect(won).toMatchObject({
      action: "new_lead",
      contactId: "c4",
      newIdentities: [{ type: "phone", value: "+84933333333" }],
    });
  });

  it("lead thất bại trong 30 ngày thì nối vào lead đó", () => {
    expect(decideIntake([{ type: "phone", value: "+84900000001" }], now, contacts, leads)).toMatchObject({
      action: "attach_recent_lost",
      leadId: "l3",
    });
  });
});

describe("nhập CSV", () => {
  it("tách ô có ngoặc kép và dấu phẩy bên trong", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });

  it("báo dòng lỗi, trùng trong tệp, trùng với CRM", () => {
    const csv = [
      "ho_ten,so_dien_thoai,quoc_gia,ngay_lien_he_gan_nhat",
      "An,0912 345 678,VN,2026-08-01",
      ",0912000111,VN,",
      "Bình,123,VN,",
      "Cường,091.234.5678,VN,",
      "Dũng,010-1234-5678,KR,01/08/2026",
      "Em,0988 777 666,VN,",
    ].join("\n");
    const { rows, headerError } = validateImport(csv, new Set(["+84988777666"]));
    expect(headerError).toBeUndefined();
    expect(rows.map((x) => x.status)).toEqual([
      "ok",
      "error",
      "error",
      "duplicate_file",
      "error",
      "duplicate_existing",
    ]);
    expect(rows[1].errors).toContain("Thiếu họ tên");
    expect(rows[2].errors).toContain("Số điện thoại không hợp lệ");
    expect(rows[3].errors).toContain("Trùng số với dòng 2");
    expect(rows[4].errors).toContain("Ngày liên hệ phải dạng YYYY-MM-DD");
    expect(rows[0].e164).toBe("+84912345678");
  });

  it("thiếu cột bắt buộc thì báo lỗi tiêu đề", () => {
    expect(validateImport("ten,sdt\nA,1", new Set()).headerError).toContain("ho_ten");
  });
});
