"use client";

import { usePathname } from "next/navigation";

import { DemoBadge } from "@/components/record";
import { isLiveScreen } from "@/lib/nav";

/** Nhãn "Dữ liệu mô phỏng" chỉ hiện khi màn đang mở chưa nối database (lib/nav.ts, LIVE_SCREENS). */
export function DemoBadgeAuto() {
  const pathname = usePathname();
  return isLiveScreen(pathname) ? null : <DemoBadge />;
}
