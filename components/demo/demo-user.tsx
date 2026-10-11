"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect } from "react";

import { ForbiddenCard } from "@/components/forbidden-card";
import type { SessionUser } from "@/lib/auth/types";
import { useDemoUser } from "@/lib/demo/session";

const DemoUserContext = createContext<SessionUser | null>(null);

/** Bọc khung ứng dụng của bản demo: chưa chọn vai trò thì về trang chọn vai trò. */
export function DemoUserProvider({ children }: { children: (user: SessionUser) => React.ReactNode }) {
  const user = useDemoUser();
  const router = useRouter();
  useEffect(() => {
    if (user === null) router.replace("/login");
  }, [user, router]);
  if (!user) return <div className="flex-1" aria-busy="true" />;
  return <DemoUserContext.Provider value={user}>{children(user)}</DemoUserContext.Provider>;
}

/** Trang trong bản demo: kiểm quyền như requirePermission của bản thật. */
export function DemoPage({
  anyOf,
  children,
}: {
  anyOf?: string[];
  children: (user: SessionUser) => React.ReactNode;
}) {
  const user = useContext(DemoUserContext);
  if (!user) return null;
  if (anyOf && !anyOf.some((p) => user.permissions.has(p))) return <ForbiddenCard />;
  return <>{children(user)}</>;
}

export function useDemoContextUser() {
  return useContext(DemoUserContext);
}
