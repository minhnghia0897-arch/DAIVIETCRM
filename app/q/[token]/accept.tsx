"use client";

import { useState, useTransition } from "react";

import { acceptByToken } from "./actions";

export function AcceptQuote({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  if (result)
    return (
      <p role="status" className={`rounded-control px-3 py-2 ${result.ok ? "bg-ok-soft" : "bg-warn-soft"}`}>
        {result.message}
      </p>
    );
  return (
    <button
      type="button"
      className="c-btn is-brand mt-2 w-full"
      disabled={pending}
      onClick={() => start(async () => setResult(await acceptByToken(token)))}
    >
      Đồng ý báo giá
    </button>
  );
}
