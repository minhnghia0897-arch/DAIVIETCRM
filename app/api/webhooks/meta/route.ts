import { createHash, timingSafeEqual } from "node:crypto";

import { after } from "next/server";

import { createAdminClient } from "@/lib/db/admin";
import { messengerConfigForPage, messengerConfigs } from "@/lib/integrations/meta_messenger/config";
import { processMessengerEvents, storeMessengerItems } from "@/lib/integrations/meta_messenger/inbound";
import {
  firstPageId,
  parseMessengerWebhook,
  verifySignature,
} from "@/lib/integrations/meta_messenger/webhook";

// Webhook của Meta cho Page (Messenger). CLAUDE.md 10.1: kiểm chữ ký, lưu thô vào webhook_events trước, trả 200
// nhanh, xử lý sau (after()); job mỗi phút xử lý lại tin còn sót. Meta tự hủy đăng ký nếu webhook lỗi kéo dài, nên chỉ
// trả lỗi khi thật sự chưa lưu được tin.
// Không bao giờ ghi App Secret, token, PSID hay nội dung tin ra log.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Bước xác minh khi Owner khai địa chỉ webhook trong ứng dụng Meta. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (mode !== "subscribe" || !token) return new Response("thiếu tham số", { status: 400 });
  const configs = await messengerConfigs(createAdminClient());
  const expected = configs.map((c) => c.verifyToken).filter((t): t is string => Boolean(t));
  if (!expected.some((t) => same(token, t))) return new Response("sai mã xác minh", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(req: Request) {
  const raw = await req.text();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response("nội dung không phải JSON", { status: 400 });
  }
  const admin = createAdminClient();
  const pageId = firstPageId(json);
  const cfg = pageId ? await messengerConfigForPage(admin, pageId) : null;
  if (!cfg?.appSecret) {
    // Page chưa kết nối (hoặc chưa có App Secret): không đọc nội dung. Trả 200 để Meta không gửi lại mãi.
    return new Response(null, { status: 200 });
  }

  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), cfg.appSecret)) {
    // Chữ ký sai: ghi dấu vết (không kèm nội dung) với signature_valid = false, không xử lý.
    await admin.from("webhook_events").upsert(
      {
        showroom_id: cfg.showroomId,
        provider: "meta_messenger",
        external_id: `invalid:${createHash("sha256").update(raw).digest("hex")}`,
        event_type: "invalid_signature",
        signature_valid: false,
        status: "ignored",
        error: "sai chữ ký X-Hub-Signature-256",
        payload: { bytes: raw.length },
      },
      { onConflict: "provider,external_id", ignoreDuplicates: true },
    );
    return new Response("sai chữ ký", { status: 401 });
  }

  const items = (parseMessengerWebhook(json) ?? []).filter((i) => i.pageId === cfg.pageId);
  const ids = await storeMessengerItems(admin, cfg, items);
  if (items.length && !ids.length) {
    // Có thể tất cả là tin trùng (Meta gửi lại): kiểm xem đã có chưa; chưa có thì báo lỗi để Meta gửi lại.
    const { count } = await admin
      .from("webhook_events")
      .select("id", { count: "exact", head: true })
      .eq("provider", "meta_messenger")
      .in(
        "external_id",
        items.map((i) => i.externalId),
      );
    if ((count ?? 0) < items.length) return new Response("chưa lưu được", { status: 500 });
  }
  if (ids.length) after(() => processMessengerEvents(admin, cfg, ids));
  return new Response(null, { status: 200 });
}
