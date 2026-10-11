"use client";

import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { startTransition } from "react";

export function AccountMenu({
  fullName,
  roleName,
  settings,
  signOutAction,
}: {
  fullName: string;
  roleName: string;
  settings: { href: string; label: string }[];
  /** Server action đăng xuất ở bản thật; hàm phía trình duyệt ở bản demo tĩnh. */
  signOutAction: () => void | Promise<void>;
}) {
  const initials = fullName
    .split(" ")
    .map((w) => w[0])
    .slice(-2)
    .join("");
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Tài khoản"
        className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-label font-bold text-brand-strong"
      >
        {initials}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-56 rounded-card border border-line bg-surface p-1 shadow-pop"
        >
          <div className="px-3 py-2">
            <p className="font-semibold">{fullName}</p>
            <p className="text-label text-text-weak">{roleName}</p>
          </div>
          {settings.length > 0 ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-line-2" />
              <DropdownMenu.Label className="px-3 py-1 text-label text-text-weak">Cài đặt</DropdownMenu.Label>
              {settings.map((s) => (
                <DropdownMenu.Item key={s.href} asChild>
                  <Link
                    href={s.href}
                    className="block rounded-control px-3 py-2 outline-none data-highlighted:bg-surface-2"
                  >
                    {s.label}
                  </Link>
                </DropdownMenu.Item>
              ))}
            </>
          ) : null}
          <DropdownMenu.Separator className="my-1 h-px bg-line-2" />
          <DropdownMenu.Item
            // Gọi trực tiếp khi chọn: menu đóng ngay khi chọn nên không dùng form (form bị gỡ trước khi gửi).
            onSelect={() => startTransition(() => signOutAction())}
            className="block w-full cursor-pointer rounded-control px-3 py-2 text-left outline-none data-highlighted:bg-surface-2"
          >
            Đăng xuất
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
