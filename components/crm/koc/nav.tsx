"use client";

import { DemoBadge } from "@/components/record";
import { FilterTabs } from "@/components/filter-tabs";

// Tab con của khu KOL, KOC. Toàn khu đang chạy dữ liệu mô phỏng (chờ duyệt bảng database).
export function KocNav() {
  return (
    <FilterTabs
      label="KOL, KOC"
      tabs={[
        { href: "/kol", label: "Danh sách", exact: true },
        { href: "/kol/bookings", label: "Booking" },
        { href: "/kol/calendar", label: "Lịch đăng" },
        { href: "/kol/performance", label: "Hiệu quả" },
      ]}
    >
      <span className="hidden sm:inline">
        <DemoBadge />
      </span>
    </FilterTabs>
  );
}
