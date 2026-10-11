import { createAdminClient } from "@/lib/db/admin";
import { cronAuthorized } from "@/lib/integrations/cron-auth";
import { messengerConfigs } from "@/lib/integrations/meta_messenger/config";
import { runMessengerReconcile } from "@/lib/integrations/meta_messenger/reconcile";

// Đọc lại tin Messenger bị lỡ (CLAUDE.md 10.1 điều 8). pg_cron gọi mỗi 2 phút qua pg_net
// (public.dispatch_messenger_reconcile); trả về chỉ số đếm, không có nội dung tin hay PSID.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: Request) {
  const admin = createAdminClient();
  if (!(await cronAuthorized(req, admin))) return new Response("không được phép", { status: 401 });
  const runs = [];
  for (const cfg of await messengerConfigs(admin)) runs.push(await runMessengerReconcile(admin, cfg));
  return Response.json({ runs });
}

export const GET = run;
export const POST = run;
