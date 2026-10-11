"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Thanh tab con kiểu tab kênh Slack (gạch chân tab đang mở), dùng cho trang có nhiều mục con. */
export function FilterTabs({
  label,
  tabs,
  children,
}: {
  label: string;
  tabs: { href: string; label: string; exact?: boolean }[];
  children?: React.ReactNode;
}) {
  // Bản demo tĩnh có dấu "/" cuối đường dẫn; bỏ đi để so khớp.
  const pathname = usePathname().replace(/\/$/, "") || "/";
  return (
    <nav aria-label={label} className="c-ftabs">
      {tabs.map((t) => {
        const on =
          pathname === t.href || (!t.exact && t.href !== "/team" && pathname.startsWith(t.href + "/"));
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className="c-ftab">
            {t.label}
          </Link>
        );
      })}
      {children ? <span className="ml-auto self-center pb-1">{children}</span> : null}
    </nav>
  );
}
