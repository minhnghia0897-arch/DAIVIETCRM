import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabasePublishableKey, supabaseUrl } from "./env";
import type { Database } from "./types";

export const VIEW_AS_COOKIE = "dv_view_as";

/**
 * Client chạy dưới phiên của người đang đăng nhập: RLS và has_perm áp đúng như người đó.
 * Khi Owner đang "Xem như", gửi kèm mã phiên để database tính quyền theo người được xem và chặn mọi thao tác ghi.
 */
export async function createClient({ ignoreViewAs = false }: { ignoreViewAs?: boolean } = {}) {
  const cookieStore = await cookies();
  const viewAs = ignoreViewAs ? undefined : cookieStore.get(VIEW_AS_COOKIE)?.value;
  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    global: viewAs ? { headers: { "x-view-as": viewAs } } : undefined,
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
