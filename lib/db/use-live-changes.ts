"use client";

import { useEffect, useRef } from "react";

import { browserClient } from "./browser";

// Nghe thay đổi của bảng qua Supabase Realtime thay cho hỏi lại server định kỳ (đỡ tốn lượt gọi Vercel). Gom các thay
// đổi dồn dập trong `debounceMs` thành một lần gọi `onChange`. Vẫn hỏi lại khi quay lại tab và mỗi `fallbackMs`
// phòng khi mất kết nối Realtime.

export interface LiveTable {
  table: "conversations" | "messages" | "notifications";
  filter?: string;
}

export function useLiveChanges(
  key: string,
  tables: readonly LiveTable[],
  onChange: () => void,
  { enabled = true, debounceMs = 400, fallbackMs = 5 * 60_000 } = {},
) {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  });
  const spec = JSON.stringify(tables);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(() => cb.current(), debounceMs);
    };
    const supabase = browserClient();
    const channel = supabase?.channel(`live:${key}`);
    if (supabase && channel) {
      for (const t of JSON.parse(spec) as LiveTable[])
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: t.table, ...(t.filter ? { filter: t.filter } : {}) },
          fire,
        );
      // Đánh dấu trên trang khi đã nghe được (kiểm thử chờ dấu này thay vì chờ mò).
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") document.documentElement.setAttribute(`data-live-${key}`, "on");
      });
    }
    const id = setInterval(() => cb.current(), fallbackMs);
    const onFocus = () => cb.current();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(timer);
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.documentElement.removeAttribute(`data-live-${key}`);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [key, spec, enabled, debounceMs, fallbackMs]);
}
