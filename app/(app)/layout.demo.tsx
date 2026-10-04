"use client";

import { useRouter } from "next/navigation";

import { CrmShell } from "@/components/crm/shell";
import { DemoUserProvider } from "@/components/demo/demo-user";
import { DEMO_ROLES, setDemoRole } from "@/lib/demo/session";
import { visibleSettings } from "@/lib/nav";

// Khung ứng dụng của bản demo tĩnh: cùng khung với app/(app)/layout.tsx, người dùng lấy từ vai trò đã chọn.
export default function DemoAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <DemoUserProvider>
      {(user) => (
        <CrmShell
          user={{
            fullName: user.fullName,
            shortName: Object.values(DEMO_ROLES).find((r) => r.id === user.id)?.shortName ?? user.fullName,
            roleName: user.roleName,
            roleKey: user.roleKey,
            showroomName: user.showroomName,
            permissions: [...user.permissions],
          }}
          settings={visibleSettings(user.permissions)}
          signOutAction={() => {
            setDemoRole(null);
            router.push("/login");
          }}
          banner={
            <p className="m-0 bg-text px-4 py-1.5 text-center text-label text-white">
              Bản demo với dữ liệu mô phỏng, agent chạy theo thời gian giả lập. Thay đổi không được lưu. Đổi
              vai trò: menu tài khoản, Đăng xuất.
            </p>
          }
        >
          {children}
        </CrmShell>
      )}
    </DemoUserProvider>
  );
}
