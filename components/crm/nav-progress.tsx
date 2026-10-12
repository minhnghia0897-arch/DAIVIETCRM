"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { NAV_START_EVENT } from "@/lib/nav-progress";

type Phase = "idle" | "wait" | "run" | "end";

// Vạch mảnh trên cùng chạy ngay khi bấm sang màn khác, tắt khi màn mới hiện (kể cả khung chờ). Màn mở nhanh hơn
// 120 ms thì không hiện, tránh nháy khi quay lại màn vừa xem.
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const url = `${pathname}?${search.toString()}`;
  const [phase, setPhase] = useState<Phase>("idle");
  const [seen, setSeen] = useState(url);
  if (seen !== url) {
    setSeen(url);
    if (phase === "run") setPhase("end");
    else if (phase === "wait") setPhase("idle");
  }

  useEffect(() => {
    const start = () => setPhase((p) => (p === "run" ? p : "wait"));
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const to = new URL(a.href, window.location.href);
      if (to.origin !== window.location.origin) return;
      if (to.pathname === window.location.pathname && to.search === window.location.search) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(NAV_START_EVENT, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(NAV_START_EVENT, start);
    };
  }, []);

  useEffect(() => {
    if (phase === "idle") return;
    // wait → run sau 120 ms; run tự dừng sau 15 giây nếu không chuyển được (mất mạng, bị chặn); end mờ dần rồi tắt.
    const t = setTimeout(
      () => setPhase(phase === "wait" ? "run" : phase === "run" ? "end" : "idle"),
      phase === "wait" ? 120 : phase === "run" ? 15_000 : 350,
    );
    return () => clearTimeout(t);
  }, [phase]);

  return <div className={`c-navbar is-${phase}`} aria-hidden />;
}
