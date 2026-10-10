"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// "Đơn & giao lắp" đã gộp vào Đơn hàng. Bản demo tĩnh không chuyển hướng ở máy chủ được nên chuyển ở trình duyệt.
export default function Page() {
  const router = useRouter();
  useEffect(() => router.replace("/orders"), [router]);
  return <p className="c-lbl p-4">Đang mở Đơn hàng…</p>;
}
