"use client";

import { useRouter } from "next/navigation";

import { DemoUserProvider } from "@/components/demo/demo-user";
import { AccountMenu } from "@/components/shell/account-menu";
import { Bell } from "@/components/shell/bell";
import { DualClock } from "@/components/shell/dual-clock";
import { TabBar } from "@/components/shell/tab-bar";
import { ToastProvider } from "@/components/ui/toast";
import { setDemoRole } from "@/lib/demo/session";
import { visibleSettings, visibleTabs } from "@/lib/nav";

// Khung ứng dụng của bản demo tĩnh: giống app/(app)/layout.tsx nhưng người dùng và số liệu lấy từ dữ liệu mô phỏng.
export default function DemoAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <DemoUserProvider>
      {(user) => (
        <div className="flex min-h-full flex-1 flex-col pb-11">
          <p className="bg-text px-4 py-1.5 text-center text-label text-white">
            Bản demo với dữ liệu mô phỏng. Thay đổi không được lưu. Đổi vai trò: menu tài khoản, Đăng xuất.
          </p>
          <header className="border-b border-line bg-surface">
            <div className="flex h-14 items-center gap-4 px-4">
              <span className="flex items-center gap-2 font-bold text-brand-strong">
                <span
                  aria-hidden
                  className="flex size-7 items-center justify-center rounded-control bg-brand text-white"
                >
                  ĐV
                </span>
                <span className="hidden sm:inline">Đại Việt</span>
              </span>
              <div className="flex-1" />
              <div className="hidden min-[900px]:block">
                <DualClock second={{ label: "Hàn Quốc", timezone: "Asia/Seoul" }} />
              </div>
              <Bell
                items={[
                  {
                    id: "n1",
                    title: "Đơn Q4-2610-0011 chờ duyệt giảm 7%",
                    link: "/orders/o-0011",
                    createdAt: "13:40 03/10/2026",
                    read: false,
                  },
                  {
                    id: "n2",
                    title: "Khoản 9.400.000đ của đơn Q4-2610-0013 chờ xác nhận",
                    link: "/orders/o-0013",
                    createdAt: "11:30 29/09/2026",
                    read: true,
                  },
                ]}
              />
              <AccountMenu
                fullName={user.fullName}
                roleName={user.roleName}
                settings={visibleSettings(user.permissions)}
                signOutAction={() => {
                  setDemoRole(null);
                  router.push("/login");
                }}
              />
            </div>
          </header>
          <TabBar showroomName={user.showroomName} tabs={visibleTabs(user.permissions)} />
          <div className="flex-1 bg-linear-to-b from-band to-page to-[220px]">
            <ToastProvider>{children}</ToastProvider>
          </div>
          <footer
            aria-label="Tiện ích"
            className="fixed inset-x-0 bottom-0 z-40 flex h-11 items-center gap-4 overflow-x-auto border-t border-line bg-surface px-4 text-label"
          >
            <span className="whitespace-nowrap">
              Hẹn gọi lại hôm nay <b className="tabular">(4)</b>
            </span>
            {user.permissions.has("lead.view_all") ? (
              <>
                <span className="whitespace-nowrap">
                  Lead chưa phân <b className="tabular">(2)</b>
                </span>
                <span className="whitespace-nowrap">
                  Quá hạn toàn đội <b className="tabular">(1)</b>
                </span>
              </>
            ) : (
              <span className="whitespace-nowrap">
                Lead quá hạn của tôi <b className="tabular">(1)</b>
              </span>
            )}
            <span className="ml-auto whitespace-nowrap text-text-weak">Dữ liệu mô phỏng</span>
          </footer>
        </div>
      )}
    </DemoUserProvider>
  );
}
