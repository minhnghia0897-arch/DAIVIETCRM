import { createHash } from "node:crypto";

import { after } from "next/server";

import { createAdminClient } from "@/lib/db/admin";
import { zaloConfigForOa } from "@/lib/integrations/zalo_oa/config";
import { processZaloEvent, storeZaloEvent } from "@/lib/integrations/zalo_oa/inbound";
import {
  isUsedZaloEvent,
  oaIdOf,
  parseZaloWebhook,
  verifyZaloSignature,
} from "@/lib/integrations/zalo_oa/webhook";

// Webhook Zalo OA. CLAUDE.md 10.1: kiểm chữ ký, lưu thô vào webhook_events, trả 200 nhanh, xử lý sau (after());
// job mỗi phút xử lý lại tin còn sót. Không bao giờ ghi khóa, token, mã người dùng hay nội dung tin ra log.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response("nội dung không phải JSON", { status: 400 });
  }
  const e = parseZaloWebhook(json);
  if (!e) return new Response(null, { status: 200 });
  const oaId = oaIdOf(e);
  const admin = createAdminClient();
  const cfg = oaId ? await zaloConfigForOa(admin, oaId) : null;
  if (!cfg?.oaSecretKey || !cfg.appId) return new Response(null, { status: 200 });

  if (
    !verifyZaloSignature(raw, req.headers.get("x-zevent-signature"), cfg.appId, cfg.oaSecretKey, e.timestamp)
  ) {
    await admin.from("webhook_events").upsert(
      {
        showroom_id: cfg.showroomId,
        provider: "zalo_oa",
        external_id: `invalid:${createHash("sha256").update(raw).digest("hex")}`,
        event_type: "invalid_signature",
        signature_valid: false,
        status: "ignored",
        error: "sai chữ ký X-ZEvent-Signature",
        payload: { bytes: raw.length },
      },
      { onConflict: "provider,external_id", ignoreDuplicates: true },
    );
    return new Response("sai chữ ký", { status: 401 });
  }

  // Sự kiện CRM chưa dùng (đã xem, theo dõi…) không lưu, trả 200 để Zalo không gửi lại.
  if (!isUsedZaloEvent(e.event_name)) return new Response(null, { status: 200 });
  let id: number | null;
  try {
    id = await storeZaloEvent(admin, cfg, e);
  } catch {
    return new Response("chưa lưu được", { status: 500 });
  }
  if (id) after(() => processZaloEvent(admin, cfg, id, e));
  return new Response(null, { status: 200 });
}
