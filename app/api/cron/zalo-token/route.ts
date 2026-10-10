import { timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/db/admin";
import { zaloConfigs } from "@/lib/integrations/zalo_oa/config";
import { ensureZaloToken } from "@/lib/integrations/zalo_oa/token";

// Làm mới token Zalo OA trước khi hết hạn (CLAUDE.md 10.4). Vercel Cron gọi kèm "Authorization: Bearer <CRON_SECRET>";
// ngoài lịch này, CRM còn tự làm mới mỗi lần gửi tin hoặc nhận tin khi token sắp hết hạn.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Làm mới khi còn dưới 12 giờ, để lịch chạy mỗi ngày một lần vẫn kịp (access token sống khoảng 25 giờ). */
const MARGIN_MS = 12 * 60 * 60_000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected))
    return new Response("không được phép", { status: 401 });

  const admin = createAdminClient();
  let ok = 0;
  let failed = 0;
  for (const cfg of await zaloConfigs(admin)) {
    if (cfg.status !== "connected" || !cfg.refreshToken) continue;
    const r = await ensureZaloToken(admin, cfg, { marginMs: MARGIN_MS });
    if (r.ok) ok++;
    else failed++;
  }
  return Response.json({ ok, failed });
}
