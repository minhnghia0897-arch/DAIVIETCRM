import { describe, expect, it } from "vitest";

import { hashInviteToken, isInviteToken, newInviteToken } from "@/lib/auth/invite-token";

describe("mã link mời theo vị trí", () => {
  it("mỗi lần tạo một mã mới, đúng dạng 43 ký tự an toàn cho đường dẫn", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a).not.toBe(b);
    expect(isInviteToken(a)).toBe(true);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("database chỉ giữ mã băm SHA-256 dạng hex, khác mã gốc", () => {
    const t = newInviteToken();
    const h = hashInviteToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
    expect(hashInviteToken(t)).toBe(h);
  });

  it("mã sai dạng không cần hỏi database", () => {
    expect(isInviteToken("")).toBe(false);
    expect(isInviteToken("abc")).toBe(false);
    expect(isInviteToken("../../login")).toBe(false);
    expect(isInviteToken(`${newInviteToken()}x`)).toBe(false);
  });
});
