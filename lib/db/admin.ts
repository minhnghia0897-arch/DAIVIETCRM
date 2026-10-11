import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Client dùng khóa bí mật, bỏ qua RLS. Chỉ dùng ở server cho việc hệ thống cần
 * (mời người dùng, thu hồi phiên), luôn sau khi đã kiểm quyền người gọi bằng has_perm.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing environment variable SUPABASE_SECRET_KEY");
  return createClient<Database>(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
