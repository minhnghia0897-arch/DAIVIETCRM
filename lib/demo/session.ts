"use client";

import { useEffect, useState } from "react";

import { PERMISSIONS, type RoleKey } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/types";

// Người dùng của bản demo tĩnh: chọn vai trò thay cho đăng nhập, lưu ở trình duyệt.
// Quyền lấy đúng mặc định theo vai trò trong lib/auth/permissions.ts, nên giao diện ẩn hiện y như bản thật.

export const DEMO_ROLES: Record<
  RoleKey,
  { id: string; fullName: string; shortName: string; roleName: string; note: string }
> = {
  owner: {
    id: "11111111-1111-4111-8111-000000000001",
    fullName: "Hà Owner",
    shortName: "Hà",
    roleName: "Chủ hệ thống",
    note: "Toàn quyền, bật tắt quyền, thấy giá vốn, cả đội",
  },
  sale_admin: {
    id: "11111111-1111-4111-8111-000000000002",
    fullName: "Minh Sale admin",
    shortName: "Minh",
    roleName: "Sale admin",
    note: "Điều phối lead, xem cả đội, không thấy giá vốn",
  },
  telesale: {
    id: "11111111-1111-4111-8111-000000000003",
    fullName: "Thảo",
    shortName: "Thảo",
    roleName: "Telesale",
    note: "Chỉ thấy khách, đơn, hiệu suất của mình",
  },
  marketing: {
    id: "11111111-1111-4111-8111-000000000005",
    fullName: "Lan Marketing",
    shortName: "Lan",
    roleName: "Marketing",
    note: "Chiến dịch, chi phí, hiệu quả theo nguồn; không thấy khách từng người",
  },
};

const KEY = "dv_demo_role";

export function demoUser(role: RoleKey): SessionUser {
  const r = DEMO_ROLES[role];
  return {
    id: r.id,
    email: null,
    fullName: r.fullName,
    showroomId: "4a000000-0000-4000-8000-000000000004",
    showroomName: "Showroom Quận 4",
    roleName: r.roleName,
    roleKey: role,
    permissions: new Set(PERMISSIONS.filter((p) => p.defaults.includes(role)).map((p) => p.key)),
    viewAs: null,
  };
}

export function setDemoRole(role: RoleKey | null) {
  try {
    if (role) localStorage.setItem(KEY, role);
    else localStorage.removeItem(KEY);
  } catch {
    // Trình duyệt chặn lưu trữ: vẫn chạy được trong phiên hiện tại.
  }
}

/** undefined: chưa đọc xong; null: chưa chọn vai trò. */
export function useDemoUser(): SessionUser | null | undefined {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  useEffect(() => {
    let role: string | null = null;
    try {
      role = localStorage.getItem(KEY);
    } catch {
      role = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(role && role in DEMO_ROLES ? demoUser(role as RoleKey) : null);
  }, []);
  return user;
}
