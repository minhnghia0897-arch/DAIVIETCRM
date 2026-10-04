"use client";

import { useEffect, useState } from "react";

function timeIn(zone: string, date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: zone,
  }).format(date);
}

/** Đồng hồ đôi: giờ VN và giờ của thị trường nước ngoài được chọn (DESIGN.md 5.6). */
export function DualClock({ second }: { second: { label: string; timezone: string } | null }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="tabular w-[120px]" aria-hidden />;
  return (
    <span className="tabular flex items-baseline gap-3 whitespace-nowrap">
      <span>
        <b>{timeIn("Asia/Ho_Chi_Minh", now)}</b> <span className="text-text-weak">VN</span>
      </span>
      {second ? (
        <span className="text-loc-kr">
          <b>{timeIn(second.timezone, now)}</b> <span className="opacity-80">{second.label}</span>
        </span>
      ) : null}
    </span>
  );
}
