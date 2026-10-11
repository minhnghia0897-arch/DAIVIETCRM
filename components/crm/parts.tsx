"use client";

import type { LucideIcon } from "lucide-react";

import type { Loc } from "@/lib/demo/crm-data";
import { BackButton } from "./back-button";

// Mảnh giao diện dùng chung cho các màn hình theo bản mẫu.

export function LocTag({ loc, city }: { loc: Loc; city?: string }) {
  return (
    <span className={`c-loc ${loc === "KR" ? "is-kr" : "is-vn"}`}>
      {loc === "KR" ? "Hàn" : "VN"}
      {city ? ` · ${city}` : ""}
    </span>
  );
}

export function PageHead({
  icon: Icon,
  color,
  kicker,
  title,
  back,
  children,
}: {
  icon: LucideIcon;
  color: string;
  kicker: string;
  title: string;
  /** Trang chi tiết: nút Quay lại màn nghiệp vụ vừa rời; mở thẳng thì về danh sách cha (nếu có). */
  back?: { href: string; label: string } | true;
  children?: React.ReactNode;
}) {
  return (
    <>
      {back ? <BackButton fallback={back === true ? undefined : back} /> : null}
      <div className="c-phd">
        <span className="c-oi is-lg" style={{ "--c": color } as React.CSSProperties} aria-hidden>
          <Icon />
        </span>
        <div className="c-t">
          <small>{kicker}</small>
          <h1 className="m-0">
            <b>{title}</b>
          </h1>
        </div>
        {children ? <div className="c-r">{children}</div> : null}
      </div>
    </>
  );
}

export function Steps({ labels, current }: { labels: string[]; current: number }) {
  return (
    <div className="c-steps" role="list" aria-label="Tiến độ">
      {labels.map((l, i) => (
        <span
          key={l}
          role="listitem"
          aria-current={i === current ? "step" : undefined}
          className={i < current ? "is-done" : i === current ? "is-cur" : undefined}
        >
          {l}
        </span>
      ))}
    </div>
  );
}

export function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <span className="c-ava" style={{ background: color }} aria-hidden>
      {name.slice(0, 1)}
    </span>
  );
}
