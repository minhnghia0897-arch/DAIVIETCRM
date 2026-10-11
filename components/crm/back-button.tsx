"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { useShell } from "./shell-context";

/**
 * Nút quay lại giữa các nghiệp vụ: đi từ lead sang đơn, từ đơn sang khách… thì "Quay lại" trả đúng màn vừa rời
 * (kèm lead, hộ đang chọn). Mở thẳng bằng đường link thì về danh sách cha (`fallback`); không có thì ẩn.
 */
export function BackButton({ fallback }: { fallback?: { href: string; label: string } }) {
  const { back } = useShell();
  if (back)
    return (
      <button type="button" className="c-back" onClick={back.go}>
        <ArrowLeft size={15} aria-hidden />
        Quay lại {back.label}
      </button>
    );
  if (!fallback) return null;
  return (
    <Link className="c-back" href={fallback.href}>
      <ArrowLeft size={15} aria-hidden />
      {fallback.label}
    </Link>
  );
}
