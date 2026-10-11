"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useDemoUser } from "@/lib/demo/session";

export default function DemoRoot() {
  const user = useDemoUser();
  const router = useRouter();
  useEffect(() => {
    if (user !== undefined) router.replace(user ? "/home" : "/login");
  }, [user, router]);
  return null;
}
