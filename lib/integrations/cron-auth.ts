import { timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";

// Ai được gọi các route /api/cron/*: Vercel Cron (hoặc người vận hành) gửi CRON_SECRET; pg_cron gửi mã tự sinh lưu
// trong Vault (cron_invoke_token, migration 20261011000700), route hỏi lại database qua public.cron_token_ok.

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function cronAuthorized(req: Request, db: SupabaseClient<Database>): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();
  if (token.length < 16) return false;
  const secret = process.env.CRON_SECRET;
  if (secret && same(token, secret)) return true;
  const { data } = await db.rpc("cron_token_ok", { p_token: token });
  return data === true;
}
