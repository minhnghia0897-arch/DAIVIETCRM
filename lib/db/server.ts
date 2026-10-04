import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabasePublishableKey, supabaseUrl } from "./env";
import type { Database } from "./types";

/** Client chạy dưới phiên của người đang đăng nhập: RLS và has_perm áp đúng như người đó. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Gọi từ server component: proxy.ts đã làm mới phiên, bỏ qua.
        }
      },
    },
  });
}
