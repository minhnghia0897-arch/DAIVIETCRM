"use client";

import Link from "next/link";
import { DropdownMenu } from "radix-ui";

import { signOut } from "@/app/(auth)/login/actions";

export function AccountMenu({
  fullName,
  roleName,
  settings,
}: {
  fullName: string;
  roleName: string;
  settings: { href: string; label: string }[];
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
          <form action={signOut}>
            <DropdownMenu.Item asChild>
              <button
                type="submit"
                className="block w-full rounded-control px-3 py-2 text-left outline-none data-highlighted:bg-surface-2"
              >
                Đăng xuất
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
