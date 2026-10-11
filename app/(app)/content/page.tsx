import type { Metadata } from "next";

import { ContentBoard } from "@/components/crm/views/content-board";
import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import type { ContentChannel, ContentFormat, ContentItem, ContentStage } from "@/lib/marketing/content";
import { MARKETING_VIEW } from "@/lib/nav";

import { deleteContent, moveContent, saveContent } from "./actions";

export const metadata: Metadata = { title: "Lịch nội dung · Đại Việt CRM" };

// Lịch nội dung thật: đọc qua RLS (marketing.view), ghi qua hàm database (marketing.manage, luật cột, nhật ký).
export default async function Page() {
  const user = await requireAnyPermission(MARKETING_VIEW);
  const supabase = await createClient();
  const [{ data: rows }, { data: people }, { data: markets }, { data: campaigns }] = await Promise.all([
    supabase
      .from("content_items")
      .select(
        "id, title, channel, format, status, owner_id, publish_at, market, product, campaign_id, draft_url, post_url, note, review_checks, position",
      )
      .order("position"),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
    supabase.from("markets").select("country_code, name").order("country_code"),
    supabase.from("campaigns").select("id, name").order("created_at", { ascending: false }),
  ]);
  const nameOf = (id: string | null) => people?.find((p) => p.id === id)?.full_name ?? null;
  const items: ContentItem[] = (rows ?? []).map((r) => {
    const checks = (r.review_checks ?? {}) as { no_health_claim?: boolean; customer_consent?: boolean };
    return {
      id: r.id,
      title: r.title,
      channel: r.channel as ContentChannel,
      format: r.format as ContentFormat,
      status: r.status as ContentStage,
      ownerId: r.owner_id,
      ownerName: nameOf(r.owner_id),
      publishAt: r.publish_at,
      market: r.market,
      product: r.product,
      campaignId: r.campaign_id,
      campaignName: campaigns?.find((c) => c.id === r.campaign_id)?.name ?? null,
      draftUrl: r.draft_url,
      postUrl: r.post_url,
      note: r.note,
      checks: {
        no_health_claim: Boolean(checks.no_health_claim),
        customer_consent: Boolean(checks.customer_consent),
      },
      position: r.position,
    };
  });

  return (
    <ContentBoard
      items={items}
      people={(people ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
      markets={(markets ?? []).map((m) => ({ value: m.country_code, label: m.name }))}
      campaigns={(campaigns ?? []).map((c) => ({ value: c.id, label: c.name }))}
      canManage={user.permissions.has("marketing.manage") && !user.viewAs}
      now={new Date().toISOString()}
      actions={{ save: saveContent, move: moveContent, remove: deleteContent }}
    />
  );
}
