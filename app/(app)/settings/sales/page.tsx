import type { Metadata } from "next";

import { SalesSettingsLive } from "@/components/crm/views/sales-settings";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import { saveDiscountLimit, saveSalesSettings } from "./actions";

export const metadata: Metadata = { title: "Cài đặt bán hàng · Đại Việt CRM" };

export default async function Page() {
  const user = await requirePermission("settings.integrations");
  const supabase = await createClient();
  const [{ data: s }, { data: roles }, { data: limits }] = await Promise.all([
    supabase.from("sales_settings").select("*").maybeSingle(),
    supabase.from("roles").select("id, name, is_owner").order("name"),
    supabase.from("discount_limits").select("role_id, max_pct"),
  ]);
  return (
    <SalesSettingsLive
      settings={{
        depositMinAmount: s?.deposit_min_amount ?? 10_000_000,
        depositMinPct: Number(s?.deposit_min_pct ?? 10),
        holdDays: s?.hold_days ?? 14,
        quoteValidDays: s?.quote_valid_days ?? 7,
        postDeliveryCallDays: s?.post_delivery_call_days ?? 3,
        dormantDays: s?.dormant_days ?? 180,
        bankInfo: s?.bank_info ?? "",
      }}
      roles={(roles ?? [])
        .filter((r) => !r.is_owner)
        .map((r) => ({
          id: r.id,
          name: r.name,
          maxPct: limits?.find((l) => l.role_id === r.id)?.max_pct ?? null,
        }))}
      readOnly={Boolean(user.viewAs)}
      actions={{ saveSalesSettings, saveDiscountLimit }}
    />
  );
}
