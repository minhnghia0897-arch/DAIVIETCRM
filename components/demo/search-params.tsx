"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

type SearchParams = Record<string, string | string[] | undefined>;

function Inner({ children }: { children: (sp: SearchParams) => React.ReactNode }) {
  const sp = useSearchParams();
  const obj: SearchParams = {};
  sp.forEach((v, k) => {
    obj[k] = v;
  });
  return <>{children(obj)}</>;
}

/** Bản demo tĩnh đọc tham số lọc trên URL ở trình duyệt. */
export function WithSearchParams({ children }: { children: (sp: SearchParams) => React.ReactNode }) {
  return (
    <Suspense>
      <Inner>{children}</Inner>
    </Suspense>
  );
}
