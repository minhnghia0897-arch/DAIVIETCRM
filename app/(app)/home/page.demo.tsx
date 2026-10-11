"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { CrmHome } from "@/components/crm/views/home";
import { DemoPage, useDemoContextUser } from "@/components/demo/demo-user";
import { LEAD_VIEW, visibleTabs } from "@/lib/nav";

export default function Page() {
  const user = useDemoContextUser();
  const router = useRouter();
  // Vai trò không làm việc với lead (Marketing…): chuyển sang khu đầu tiên mình được mở, như bản thật.
  const away =
    user && !LEAD_VIEW.some((p) => user.permissions.has(p))
      ? visibleTabs(user.permissions).find((t) => t.href !== "/home" && t.anyOf.length > 0)?.href
      : undefined;
  useEffect(() => {
    if (away) router.replace(away);
  }, [away, router]);
  if (away) return null;
  return <DemoPage anyOf={LEAD_VIEW}>{() => <CrmHome />}</DemoPage>;
}
