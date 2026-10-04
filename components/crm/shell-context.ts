"use client";

import { createContext, useContext } from "react";

export interface ShellCtx {
  perms: ReadonlySet<string>;
  can: (perm: string) => boolean;
  /** Mở khung trợ lý AI và hỏi một câu. */
  ask: (question: string) => void;
  /** Tên gọi ngắn của người dùng, khớp cột "người phụ trách" trong dữ liệu mô phỏng. */
  me: string;
  /** Mã người dùng, để lọc dữ liệu "của mình" (ví dụ đơn có người bán là mình). */
  userId: string;
  isOwner: boolean;
  /** Khóa vai trò, đầu vào của giới hạn giảm giá trong hàm định giá. */
  roleKey: string;
}

export const ShellContext = createContext<ShellCtx | null>(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside CrmShell");
  return ctx;
}
