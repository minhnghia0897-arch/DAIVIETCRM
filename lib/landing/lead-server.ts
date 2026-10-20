import "server-only";

import { createHash } from "node:crypto";

import type { Json } from "@/lib/db/types";
import { createAdminClient } from "@/lib/db/admin";
import { buildIngestPayload } from "@/lib/leads/intake";
import { maskPhonesInText } from "@/lib/phone";

import { consentGiven, isLandingSlug, landingLeadSchema, pickUtm } from "./contract";

// Nhận form của landing page (app/api/lp/[slug]/lead): lead đi qua ingest_lead như mọi nguồn (chống trùng theo số,
// chia người đang trực, SLA, Telegram che số), nguồn landing_page, UTM giữ trong source_detail để sau này gửi chuyển
// đổi về nền tảng quảng cáo. Chặn máy bằng ô bẫy và giới hạn số lần gửi theo địa chỉ IP (lưu IP đã băm).

/** Một địa chỉ IP gửi tối đa ngần này lần cho một trang trong cửa sổ dưới đây. */
export const LANDING_LIMIT = 5;
const WINDOW_MS = 10 * 60_000;

export interface LandingLeadResponse {
  status: number;
  body: { ok: boolean; message: string };
}

const OK = "Đã nhận thông tin! Tư vấn viên sẽ gọi lại cho bạn sớm.";

export async function submitLandingLead(
  slug: string,
  raw: unknown,
  ip: string,
): Promise<LandingLeadResponse> {
  if (!isLandingSlug(slug)) return { status: 404, body: { ok: false, message: "Trang không tồn tại." } };
  const parsed = landingLeadSchema.safeParse(raw);
  const admin = createAdminClient();
  const { data: page } = await admin
    .from("landing_pages")
    .select("id, slug, title, status, showroom_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!page || page.status !== "published")
    return { status: 404, body: { ok: false, message: "Chương trình này đã kết thúc." } };

  const ipHash = createHash("sha256").update(`landing:${ip}`).digest("hex");
  const log = async (result: string, leadId?: string) => {
    await admin.from("landing_lead_log").insert({
      showroom_id: page.showroom_id,
      landing_page_id: page.id,
      ip_hash: ipHash,
      result,
      lead_id: leadId ?? null,
    });
  };

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await admin
    .from("landing_lead_log")
    .select("id", { count: "exact", head: true })
    .eq("landing_page_id", page.id)
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if ((count ?? 0) >= LANDING_LIMIT) {
    await log("limited");
    return {
      status: 429,
      body: { ok: false, message: "Bạn đã gửi nhiều lần, vui lòng thử lại sau ít phút hoặc gọi hotline." },
    };
  }

  if (!parsed.success) {
    await log("invalid");
    return { status: 400, body: { ok: false, message: "Vui lòng nhập họ tên và số điện thoại đúng." } };
  }
  const f = parsed.data;
  // Máy tự điền ô bẫy: trả như thành công để máy không dò ra, không tạo lead.
  if (f.website.trim()) {
    await log("spam");
    return { status: 200, body: { ok: true, message: OK } };
  }

  const { data: markets } = await admin
    .from("markets")
    .select("country_code")
    .eq("showroom_id", page.showroom_id)
    .eq("is_active", true);
  const active = (markets ?? []).map((m) => m.country_code);
  const noteLines = [
    f.whereLabel && `Khách đang ở: ${f.whereLabel}`,
    f.model && `Mẫu quan tâm: ${f.model}`,
    f.note && `Lời nhắn: ${f.note}`,
  ].filter(Boolean);
  const payload = buildIngestPayload(
    {
      fullName: f.name,
      phone: f.phone,
      country: active.includes(f.where) ? f.where : "unknown",
      sourceKey: "landing_page",
      productInterest: f.model || undefined,
      note: noteLines.length ? `Từ landing page "${page.title}". ${noteLines.join(". ")}` : undefined,
      marketingConsent: consentGiven(f.consent),
    },
    active,
  );
  const detail: Record<string, string> = {
    ...payload.source_detail,
    landing: page.slug,
    ...pickUtm(f.utm),
  };
  if (f.referrer) detail.referrer = maskPhonesInText(f.referrer).slice(0, 500);

  const { data, error } = await admin.rpc("ingest_lead", {
    p: { ...payload, source_detail: detail, showroom_id: page.showroom_id } as unknown as Json,
  });
  if (error || !data) {
    await log("failed");
    return {
      status: 500,
      body: { ok: false, message: "Chưa gửi được, vui lòng thử lại hoặc gọi hotline để được tư vấn." },
    };
  }
  const res = data as { action?: string; lead_id?: string };
  await log(res.action === "attached" ? "attached" : "created", res.lead_id);
  return { status: 200, body: { ok: true, message: OK } };
}
