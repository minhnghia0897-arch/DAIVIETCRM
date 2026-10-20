import { describe, expect, it } from "vitest";

import {
  consentGiven,
  isLandingSlug,
  landingLeadSchema,
  pickUtm,
  readLandingSettings,
  slugify,
  vnLocalToIso,
  type LandingData,
} from "@/lib/landing/contract";
import { injectLanding, scriptJson } from "@/lib/landing/inject";
import { leadStatsBySlug } from "@/lib/landing/stats";

const DATA: LandingData = {
  page: { slug: "khai-truong", title: "Khai trương" },
  products: [
    {
      sku: "DC302",
      name: "Ghế </script><script>alert(1)</script>",
      shortDesc: null,
      imageUrl: null,
      badge: null,
      giftText: null,
      listPrice: 49_900_000,
      price: 49_900_000,
      promoGifts: [],
      promotions: [],
    },
  ],
  gifts: [],
  contact: { hotline: "", zalo: "", address: "", openHours: "", kakao: "", mapUrl: "" },
  bannerUrl: "",
  countdownEnd: "",
  leadUrl: "/api/lp/khai-truong/lead",
};

describe("landing page", () => {
  it("đường dẫn: chữ thường không dấu, số, gạch ngang", () => {
    expect(slugify("Khai trương Quận 4 – Đại Việt!")).toBe("khai-truong-quan-4-dai-viet");
    expect(isLandingSlug("khai-truong-q4")).toBe(true);
    expect(isLandingSlug("Khai-Truong")).toBe(false);
    expect(isLandingSlug("../login")).toBe(false);
    expect(isLandingSlug("a")).toBe(false);
  });

  it("chèn dữ liệu ngay sau <head>, không để tên sản phẩm phá thẻ script", () => {
    const html = injectLanding(
      "<!doctype html><html><head><title>x</title></head><body></body></html>",
      DATA,
    );
    expect(html.indexOf("window.CRM_LANDING")).toBeLessThan(html.indexOf("<title>"));
    expect(html).toContain("window.CRMLanding");
    // Chỉ một thẻ </script> cho dữ liệu, một cho bộ gửi form: tên sản phẩm không đóng được thẻ.
    expect(html.match(/<\/script>/g)?.length).toBe(2);
    expect(scriptJson({ a: "</script>" })).not.toContain("</");
  });

  it("HTML không có <head> thì chèn lên đầu", () => {
    expect(injectLanding("<p>hi</p>", DATA).startsWith("<script>window.CRM_LANDING")).toBe(true);
  });

  it("form: cần họ tên và số đủ chữ số; đồng ý chỉ khi khách tích", () => {
    expect(landingLeadSchema.safeParse({ name: "An", phone: "0912 345 678" }).success).toBe(true);
    expect(landingLeadSchema.safeParse({ name: "", phone: "0912345678" }).success).toBe(false);
    expect(landingLeadSchema.safeParse({ name: "An", phone: "123" }).success).toBe(false);
    expect(consentGiven(true)).toBe(true);
    expect(consentGiven("on")).toBe(true);
    expect(consentGiven(undefined)).toBe(false);
    expect(consentGiven("")).toBe(false);
  });

  it("chỉ giữ tham số quảng cáo đã biết", () => {
    expect(pickUtm({ utm_source: "facebook", fbclid: "abc", evil: "x" })).toEqual({
      utm_source: "facebook",
      fbclid: "abc",
    });
  });

  it("cài đặt sai dạng thì về mặc định; hạn ưu đãi theo giờ VN", () => {
    expect(readLandingSettings({ hotline: "0909", mapUrl: "javascript:alert(1)" }).hotline).toBe("");
    expect(readLandingSettings({ hotline: "0909" }).hotline).toBe("0909");
    expect(vnLocalToIso("2026-10-31T23:59")).toBe("2026-10-31T23:59:00+07:00");
    expect(new Date(vnLocalToIso("2026-10-31T23:59")).toISOString()).toBe("2026-10-31T16:59:00.000Z");
  });

  it("đếm lead theo trang: tổng, 7 ngày, lần gần nhất", () => {
    const now = new Date("2026-10-20T00:00:00Z");
    const stats = leadStatsBySlug(
      [
        { created_at: "2026-10-19T10:00:00Z", source_detail: { landing: "a" } },
        { created_at: "2026-10-01T10:00:00Z", source_detail: { landing: "a" } },
        { created_at: "2026-10-18T10:00:00Z", source_detail: {} },
      ],
      now,
    );
    expect(stats.get("a")).toEqual({ total: 2, week: 1, last: "2026-10-19T10:00:00Z" });
    expect(stats.size).toBe(1);
  });
});
