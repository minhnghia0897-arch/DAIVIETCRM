"use client";

import Link from "next/link";

import { formatDateTime } from "@/lib/format";
import type { Notice } from "@/lib/notify/notice";

// Danh sách thông báo trong khung chuông của bản thật. Bấm một thông báo thì mở đúng chỗ và đánh dấu đã đọc.
export function NoticeList({
  items,
  onOpen,
  onReadAll,
}: {
  items: Notice[];
  onOpen: (n: Notice) => void;
  onReadAll: () => void;
}) {
  if (!items.length)
    return (
      <p className="c-empty">
        Chưa có thông báo nào. Lead được giao, lead quá hạn, việc cần duyệt sẽ hiện ở đây.
      </p>
    );
  return (
    <>
      <ul className="m-0 max-h-96 list-none overflow-y-auto p-0" aria-label="Thông báo">
        {items.map((n) => {
          const body = (
            <>
              <span className={n.read ? "" : "font-semibold"}>{n.title}</span>
              <span className="c-lbl block">{formatDateTime(n.createdAt)}</span>
            </>
          );
          return (
            <li key={n.id} className={`border-t border-line-2 ${n.read ? "" : "bg-brand-soft"}`}>
              {n.link ? (
                <Link href={n.link} className="block px-4 py-2" onClick={() => onOpen(n)}>
                  {body}
                </Link>
              ) : (
                <button type="button" className="block w-full px-4 py-2 text-left" onClick={() => onOpen(n)}>
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {items.some((n) => !n.read) ? (
        <div className="border-t border-line-2 px-4 py-2">
          <button type="button" className="c-btn" onClick={onReadAll}>
            Đánh dấu đã đọc hết
          </button>
        </div>
      ) : null}
    </>
  );
}
