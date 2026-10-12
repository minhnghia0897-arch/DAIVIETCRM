import { runAutoReply } from "@/lib/ai/auto-reply";
import { createAdminClient } from "@/lib/db/admin";
import { cronAuthorized } from "@/lib/integrations/cron-auth";

// Job quét hội thoại đang chờ AI trả lời mà đường webhook chưa xử lý (máy chủ tắt giữa chừng, tin vào qua job đọc lại
// tin bị lỡ…). pg_cron gọi mỗi phút qua pg_net, chỉ khi có việc (public.dispatch_ai_replies). Trả về số đếm, không có
// nội dung tin.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: Request) {
  const admin = createAdminClient();
  if (!(await cronAuthorized(req, admin))) return new Response("không được phép", { status: 401 });
  const started = Date.now();
  const { data } = await admin.rpc("pending_ai_conversations", { p_limit: 5 });
  const results: string[] = [];
  for (const id of data ?? []) {
    // Chừa thời gian cho lượt cuối: mỗi lượt mất vài giây tới vài chục giây.
    if (Date.now() - started > 30_000) break;
    results.push(...(await runAutoReply(admin, id)));
  }
  return Response.json({ conversations: (data ?? []).length, results });
}

export const GET = run;
export const POST = run;
