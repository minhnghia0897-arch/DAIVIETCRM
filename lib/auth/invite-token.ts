import { createHash, randomBytes } from "node:crypto";

// Mã trong link mời theo vị trí (/join/<mã>): 32 byte ngẫu nhiên, khó đoán. Database chỉ giữ mã băm, nên lộ bảng
// invite_links cũng không dùng được link.

/** Số ngày link mời còn dùng được. */
export const INVITE_LINK_DAYS = 7;

export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Mã đúng dạng newInviteToken tạo ra (43 ký tự base64url); sai dạng thì không cần hỏi database. */
export function isInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
