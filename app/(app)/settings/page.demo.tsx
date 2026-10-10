"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useDemoContextUser } from "@/components/demo/demo-user";
import { visibleSettings } from "@/lib/nav";

export default function Page() {
  const user = useDemoContextUser();
  const router = useRouter();
  useEffect(() => {
    if (user) router.replace(visibleSettings(user.permissions)[0]?.href ?? "/forbidden");
  }, [user, router]);
  return null;
}
