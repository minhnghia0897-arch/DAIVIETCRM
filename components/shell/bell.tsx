"use client";

import { Bell as BellIcon } from "lucide-react";
import Link from "next/link";
import { Popover } from "radix-ui";

export interface BellItem {
  id: string;
  title: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export function Bell({ items }: { items: BellItem[] }) {
  const unread = items.filter((i) => !i.read).length;
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
        className="relative flex size-9 items-center justify-center rounded-control hover:bg-surface-2"
      >
        <BellIcon className="size-5" />
        {unread ? (
          <span className="tabular absolute -top-0.5 -right-0.5 min-w-4 rounded-pill bg-err px-1 text-[11px] font-bold text-white">
            {unread}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-80 rounded-card border border-line bg-surface shadow-pop"
        >
          <p className="border-b border-line-2 px-[14px] py-2 font-bold">Thông báo</p>
          {items.length === 0 ? (
            <p className="px-[14px] py-3 text-text-weak">Chưa có thông báo nào.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="border-b border-line-2 px-[14px] py-2 last:border-0">
                  {n.link ? (
                    <Link href={n.link} className={n.read ? "" : "font-semibold"}>
                      {n.title}
                    </Link>
                  ) : (
                    <span className={n.read ? "" : "font-semibold"}>{n.title}</span>
                  )}
                  <p className="tabular text-label text-text-weak">{n.createdAt}</p>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
