"use client";

import { useRouter } from "next/navigation";

import { Card, CardBody } from "@/components/ui/card";
import type { RoleKey } from "@/lib/auth/permissions";
import { DEMO_ROLES, setDemoRole } from "@/lib/demo/session";

// Bản demo: chọn vai trò thay cho đăng nhập.
export default function DemoLogin() {
  const router = useRouter();
  return (
    <Card>
      <CardBody className="space-y-4 py-5">
        <h1 className="text-page-title font-bold">Bản demo</h1>
        <p className="text-text-weak">
          Chọn vai trò để xem hệ thống như người đó thấy. Dữ liệu là mô phỏng, mọi thay đổi không được lưu.
        </p>
        <ul className="space-y-2">
          {(Object.keys(DEMO_ROLES) as RoleKey[]).map((role) => (
            <li key={role}>
              <button
                type="button"
                onClick={() => {
                  setDemoRole(role);
                  router.push("/home");
                }}
                className="w-full rounded-card border border-line bg-surface px-[14px] py-3 text-left hover:border-brand hover:bg-brand-soft"
              >
                <span className="block font-semibold">
                  {DEMO_ROLES[role].fullName}, {DEMO_ROLES[role].roleName}
                </span>
                <span className="block text-label text-text-weak">{DEMO_ROLES[role].note}</span>
              </button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
