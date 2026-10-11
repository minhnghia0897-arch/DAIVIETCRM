"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { isLiveScreen } from "@/lib/nav";

import { CrmLiveShell, type ShellProps } from "./shell";

// Khung bản thật (app/(app)/layout.tsx). Kho mô phỏng chỉ nạp (tách gói, tải khi cần) cho màn còn mô phỏng và vài
// màn thật vẫn dùng chung thành phần với bản demo; các màn thật khác không tải kho mô phỏng.

const DemoStore = dynamic(() => import("./demo-shell").then((m) => m.DemoStore));

/** Màn thật còn dùng chung thành phần đọc kho mô phỏng (bỏ dần khi tách xong). */
const NEEDS_DEMO_STORE = ["/tasks", "/settings/audit", "/settings/notifications", "/settings/integrations"];

export function AppShell(props: Omit<ShellProps, "wrapContent">) {
  return (
    <CrmLiveShell {...props} wrapContent={(c) => <DemoGate user={props.user}>{c}</DemoGate>}>
      {props.children}
    </CrmLiveShell>
  );
}

function DemoGate({ user, children }: { user: ShellProps["user"]; children: React.ReactNode }) {
  const pathname = usePathname();
  const needs =
    !isLiveScreen(pathname) || NEEDS_DEMO_STORE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return needs ? <DemoStore user={user}>{children}</DemoStore> : <>{children}</>;
}
