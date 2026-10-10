import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  budgetUsed,
  campaignSchema,
  funnelMetrics,
  parseMoney,
  parseSpendCsv,
  shortVnd,
} from "@/lib/marketing/campaign";
import { visibleTabs } from "@/lib/nav";

const perms = (role: "owner" | "sale_admin" | "telesale" | "marketing") =>
  new Set(PERMISSIONS.filter((p) => p.defaults.includes(role)).map((p) => p.key));

describe("vai trò Marketing", () => {
  it("không có quyền xem lead, số điện thoại, giá vốn, xuất file", () => {
    const m = perms("marketing");
    for (const k of [
      "lead.view_own",
      "lead.view_all",
      "contact.phone_reveal",
      "contact.phone_reveal_assigned",
      "product.view_cost",
      "lead.export",
      "order.export",
    ])
      expect(m.has(k), k).toBe(false);
    expect(m.has("marketing.view")).toBe(true);
    expect(m.has("marketing.manage")).toBe(true);
    expect(m.has("marketing.budget_approve")).toBe(false);
  });
  it("chỉ Owner duyệt ngân sách; sale admin chỉ xem", () => {
    expect(PERMISSIONS.find((p) => p.key === "marketing.budget_approve")?.defaults).toEqual(["owner"]);
    expect(perms("sale_admin").has("marketing.view")).toBe(true);
    expect(perms("sale_admin").has("marketing.manage")).toBe(false);
    expect(perms("telesale").has("marketing.view")).toBe(false);
  });
  it("menu Marketing gom Tổng quan, Chiến dịch, Kênh & nội dung, KOL, KOC; telesale không thấy", () => {
    const tab = visibleTabs(perms("marketing")).find((t) => t.label === "Marketing");
    expect(tab?.children?.map((c) => c.label)).toEqual([
      "Tổng quan",
      "Chiến dịch",
      "Kênh & nội dung",
      "KOL, KOC",
    ]);
    expect(visibleTabs(perms("marketing")).some((t) => t.href === "/leads")).toBe(false);
    expect(visibleTabs(perms("telesale")).some((t) => t.label === "Marketing")).toBe(false);
  });
});

describe("tiền và chỉ số", () => {
  it("đọc số tiền người dùng gõ", () => {
    expect(parseMoney("20.000.000")).toBe(20_000_000);
    expect(parseMoney("20,000,000 đ")).toBe(20_000_000);
    expect(parseMoney("30tr")).toBe(30_000_000);
    expect(parseMoney("1,5 triệu")).toBe(1_500_000);
    expect(parseMoney("800k")).toBe(800_000);
    expect(parseMoney("12345")).toBe(12345);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.2.3")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
  it("chi phí mỗi lead, mỗi lead chốt, tỷ lệ; chia cho 0 thì không có số", () => {
    expect(funnelMetrics({ leads: 50, contacted: 40, converted: 5, lost: 3, spend: 10_000_000 })).toEqual({
      cpl: 200_000,
      costPerWin: 2_000_000,
      contactRate: 80,
      winRate: 10,
    });
    expect(funnelMetrics({ leads: 0, contacted: 0, converted: 0, lost: 0, spend: 1 })).toEqual({
      cpl: null,
      costPerWin: null,
      contactRate: null,
      winRate: null,
    });
    expect(budgetUsed(15, 0)).toBeNull();
    expect(budgetUsed(31_000_000, 30_000_000)).toBe(103);
    expect(shortVnd(12_500_000)).toBe("12,5 tr");
  });
  it("kiểm dữ liệu chiến dịch", () => {
    expect(campaignSchema.safeParse({ name: "A", platform: "facebook" }).success).toBe(true);
    expect(campaignSchema.safeParse({ name: "", platform: "facebook" }).success).toBe(false);
    expect(campaignSchema.safeParse({ name: "A", platform: "x" }).success).toBe(false);
    const bad = campaignSchema.safeParse({
      name: "A",
      platform: "tiktok",
      startsOn: "2026-10-10",
      endsOn: "2026-10-01",
    });
    expect(bad.success).toBe(false);
    expect(campaignSchema.safeParse({ name: "A", platform: "facebook", externalId: "a b" }).success).toBe(
      false,
    );
  });
});

describe("file CSV chi phí", () => {
  it("đọc dấu phẩy, chấm phẩy, ngày DD/MM/YYYY, số tiền có dấu chấm", () => {
    const r = parseSpendCsv(
      '﻿Ngày;Chiến dịch;Số tiền\n09/10/2026;120210000000001;1.200.000\n2026-10-08;Quà 20/10;"800k"\n',
    );
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, date: "2026-10-09", campaign: "120210000000001", amount: 1_200_000 },
      { line: 3, date: "2026-10-08", campaign: "Quà 20/10", amount: 800_000 },
    ]);
  });
  it("báo dòng lỗi và thiếu cột", () => {
    const r = parseSpendCsv("Date,Campaign,Spend\n31/13/2026,A,100\n2026-10-01,,100\n2026-10-01,A,abc\n");
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(parseSpendCsv("a,b\n1,2").errors[0].message).toMatch(/Thiếu cột/);
    expect(parseSpendCsv("").errors[0].message).toMatch(/chưa có dòng/);
  });
});
