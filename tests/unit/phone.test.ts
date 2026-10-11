import { describe, expect, it } from "vitest";

import { countryFromE164, maskPhone, normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it.each([
    ["0912345678", "VN", "+84912345678"],
    ["0912 345 678", "VN", "+84912345678"],
    ["0912.345.678", "VN", "+84912345678"],
    ["0912-345-678", "VN", "+84912345678"],
    ["+84912345678", "VN", "+84912345678"],
    ["84912345678", "VN", "+84912345678"],
    ["+84 912 345 678", "KR", "+84912345678"],
    ["0084912345678", "VN", "+84912345678"],
    ["010-1234-5678", "KR", "+821012345678"],
    ["01012345678", "KR", "+821012345678"],
    ["10-1234-5678", "KR", "+821012345678"],
    ["+82 10 1234 5678", "VN", "+821012345678"],
    ["821012345678", "VN", "+821012345678"],
    ["+82 010-1234-5678", "VN", "+821012345678"],
  ] as const)("%s (mặc định %s) → %s", (raw, country, e164) => {
    const result = normalizePhone(raw, country);
    expect(result.valid).toBe(true);
    expect(result.e164).toBe(e164);
    expect(result.raw).toBe(raw);
  });

  it.each(["", "123", "abc", "0000000000", "09123"])("báo không hợp lệ: %j", (raw) => {
    const result = normalizePhone(raw, "VN");
    expect(result.valid).toBe(false);
    expect(result.e164).toBeNull();
    expect(result.raw).toBe(raw);
  });

  it("nhận diện thị trường từ số", () => {
    expect(normalizePhone("010-1234-5678", "KR").country).toBe("KR");
    expect(normalizePhone("0912345678", "VN").country).toBe("VN");
    expect(countryFromE164("+821012345678")).toBe("KR");
  });
});

describe("maskPhone", () => {
  it("che số Hàn", () => {
    expect(maskPhone("+821012344471")).toBe("+82 10••••4471");
  });

  it("che số Việt Nam", () => {
    expect(maskPhone("+84901234215")).toBe("090•••215");
  });

  it("không để lộ số đầy đủ", () => {
    for (const e164 of ["+821012344471", "+84901234215"]) {
      expect(maskPhone(e164)).not.toContain(e164.slice(-7));
    }
  });
});
