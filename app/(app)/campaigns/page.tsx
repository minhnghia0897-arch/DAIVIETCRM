import type { Metadata } from "next";

import { CampaignsView, type CampaignRow } from "@/components/crm/views/marketing";
import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import type { Platform } from "@/lib/marketing/campaign";
import { MARKETING_VIEW } from "@/lib/nav";
import { vnToday } from "@/lib/team/attendance";

import { importSpendCsv, recordSpend, requestBudget, saveCampaign } from "./actions";

export const metadata: Metadata = { title: "Chiến dịch · Đại Việt CRM" };

// Chiến dịch thật: đọc qua RLS (marketing.view); ghi qua hàm database (marketing.manage, duyệt ngân sách).
export default async function Page() {
  const user = await requireAnyPermission(MARKETING_VIEW);
  const supabase = await createClient();
  const [{ data: campaigns }, { data: spend }, { data: markets }] = await Promise.all([
    supabase
      .from("campaigns")
      .select(
        "id, name, platform, external_id, market, starts_on, ends_on, budget, requested_budget, status, owner_id, note",
      )
      .order("created_at", { ascending: false }),
    supabase.from("campaign_spend").select("campaign_id, spend_date, amount"),
    supabase.from("markets").select("country_code, name").order("country_code"),
  ]);
  const owners = [
    ...new Set((campaigns ?? []).map((c) => c.owner_id).filter((x): x is string => Boolean(x))),
  ];
  const { data: people } = owners.length
    ? await supabase.from("profiles").select("id, full_name").in("id", owners)
    : { data: [] as { id: string; full_name: string }[] };

  const rows: CampaignRow[] = (campaigns ?? []).map((c) => {
    const s = (spend ?? []).filter((x) => x.campaign_id === c.id);
    return {
      id: c.id,
      name: c.name,
      platform: c.platform as Platform,
      externalId: c.external_id,
      market: c.market,
      startsOn: c.starts_on,
      endsOn: c.ends_on,
      budget: Number(c.budget),
      requestedBudget: c.requested_budget === null ? null : Number(c.requested_budget),
      status: c.status,
      ownerName: people?.find((p) => p.id === c.owner_id)?.full_name ?? null,
      note: c.note,
      spend: s.reduce((t, x) => t + Number(x.amount), 0),
      lastSpendOn:
        s
          .map((x) => x.spend_date)
          .sort()
          .at(-1) ?? null,
    };
  });

  return (
    <CampaignsView
      campaigns={rows}
      markets={(markets ?? []).map((m) => ({ code: m.country_code, name: m.name }))}
      canManage={user.permissions.has("marketing.manage") && !user.viewAs}
      canApprove={user.permissions.has("marketing.budget_approve")}
      today={vnToday(new Date())}
      actions={{ save: saveCampaign, requestBudget, recordSpend, importCsv: importSpendCsv }}
    />
  );
}
