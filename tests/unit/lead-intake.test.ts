import { describe, expect, it } from "vitest";

import { buildIngestPayload, sourceFromKey } from "@/lib/leads/intake";

const MARKETS = ["VN", "KR"];

describe("buildIngestPayload", () => {
  it("chuẩn hóa số VN và che số", () => {
    const p = buildIngestPayload(
      { fullName: " Chị Hương ", phone: "0912 345 678", country: "unknown", sourceKey: "walk_in" },
      MARKETS,
    );
    expect(p.full_name).toBe("Chị Hương");
    expect(p.phone).toEqual({ raw: "0912 345 678", e164: "+84912345678", masked: "091•••678", valid: true });
    expect(p.country).toBe("VN");
    expect(p.source).toBe("walk_in");
  });

  it("suy thị trường Hàn từ đầu số khi chưa rõ", () => {
    const p = buildIngestPayload(
      { fullName: "Thu", phone: "+82 10-5521-2290", country: "unknown", sourceKey: "fb_ads_kr" },
      MARKETS,
    );
    expect(p.phone.e164).toBe("+821055212290");
    expect(p.country).toBe("KR");
    expect(p.source).toBe("meta_lead_ads");
  });

  it("số Hàn gõ kiểu trong nước khi nhân viên đã chọn Hàn Quốc", () => {
    const p = buildIngestPayload(
      { fullName: "Khoa", phone: "010-1234-5678", country: "KR", sourceKey: "referral" },
      MARKETS,
    );
    expect(p.phone.e164).toBe("+821012345678");
    expect(p.country).toBe("KR");
  });

  it("số Hàn gõ kiểu trong nước khi chưa chọn thị trường", () => {
    const p = buildIngestPayload(
      { fullName: "Khoa", phone: "010-1234-5678", country: "unknown", sourceKey: "referral" },
      MARKETS,
    );
    expect(p.phone.e164).toBe("+821012345678");
    expect(p.country).toBe("KR");
  });

  it("giữ thị trường nhân viên chọn dù đầu số khác (số VN nhưng sống ở Hàn)", () => {
    const p = buildIngestPayload(
      { fullName: "Lan", phone: "0901234567", country: "KR", sourceKey: "walk_in" },
      MARKETS,
    );
    expect(p.country).toBe("KR");
    expect(p.phone).toMatchObject({ e164: "+84901234567", valid: true });
  });

  it("số sai vẫn đi tiếp, che số, không có E.164", () => {
    const p = buildIngestPayload(
      { fullName: "A", phone: "0123 456", country: "unknown", sourceKey: "walk_in" },
      MARKETS,
    );
    expect(p.phone.valid).toBe(false);
    expect(p.phone.e164).toBeNull();
    expect(p.phone.masked).toBe("•••456");
    expect(p.country).toBe("unknown");
  });

  it("che số điện thoại gõ trong ghi chú", () => {
    const p = buildIngestPayload(
      {
        fullName: "A",
        phone: "0912345678",
        country: "VN",
        sourceKey: "walk_in",
        note: "Gọi cho con gái 0987 654 321",
      },
      MARKETS,
    );
    expect(p.note).not.toContain("0987 654 321");
  });

  it("thị trường không bật thì coi như chưa rõ", () => {
    const p = buildIngestPayload(
      { fullName: "A", phone: "+14155552671", country: "US", sourceKey: "walk_in" },
      MARKETS,
    );
    expect(p.country).toBe("unknown");
  });
});

describe("sourceFromKey", () => {
  it("mục nguồn tự thêm trong danh mục là nhập tay", () => {
    expect(sourceFromKey("koc_kol")).toBe("manual");
    expect(sourceFromKey("hotline")).toBe("hotline");
  });
});
