"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Menu trái khu Cài đặt kiểu trang Tùy chọn của Slack: mục đang mở nền xanh chữ trắng. */
export function SettingsMenu({ items }: { items: { href: string; label: string }[] }) {
  // Bản demo tĩnh có dấu "/" cuối đường dẫn; bỏ đi để so khớp.
  const pathname = usePathname().replace(/\/$/, "");
  return (
    <ul className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((i) => {
        const on = pathname === i.href || pathname.startsWith(i.href + "/");
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={on ? "page" : undefined}
              className={`block rounded-control px-3 py-1.5 whitespace-nowrap ${
                on ? "bg-brand font-bold text-white" : "text-text hover:bg-surface-2"
              }`}
            >
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
