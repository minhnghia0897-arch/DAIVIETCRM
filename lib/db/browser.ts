"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./types";

// Client Supabase trong trình duyệt, dùng phiên đăng nhập ở cookie: chỉ để nghe thay đổi (Realtime). Dữ liệu vẫn đọc
// qua server component; Realtime tuân theo RLS nên mỗi người chỉ nhận thay đổi của dòng mình được xem.

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client ??= createBrowserClient<Database>(url, key);
  return client;
}
