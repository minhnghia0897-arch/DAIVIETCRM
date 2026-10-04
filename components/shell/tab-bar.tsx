"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function TabBar({
  showroomName,
  tabs,
}: {
  showroomName: string;
  tabs: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Ứng dụng" className="border-b border-line bg-surface">
      <div className="flex items-stretch gap-1 overflow-x-auto px-4">
        <span className="flex items-center pr-4 font-semibold whitespace-nowrap">{showroomName}</span>
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center border-b-[3px] px-3 whitespace-nowrap",
                active
                  ? "border-brand-strong font-bold"
                  : "border-transparent text-text-weak hover:text-text",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
