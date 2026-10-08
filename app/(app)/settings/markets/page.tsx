import type { Metadata } from "next";

import { MarketsLive } from "@/components/crm/views/settings-live";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import { saveMarket } from "../config-actions";

export const metadata: Metadata = { title: "Thị trường · Đại Việt CRM" };

// Thị trường thật (markets): múi giờ, khung gọi tốt theo giờ địa phương của khách, kênh được phép liên lạc.
export default async function Page() {
  const user = await requirePermission("settings.assignment");
  const supabase = await createClient();
  const { data } = await supabase
    .from("markets")
    .select("id, country_code, name, timezone, call_windows, allowed_channels, is_active")
    .order("sort")
    .order("created_at");
  return (
    <MarketsLive
      now={new Date().toISOString()}
      readOnly={Boolean(user.viewAs)}
      save={saveMarket}
      markets={(data ?? []).map((m) => ({
        id: m.id,
        countryCode: m.country_code,
        name: m.name,
        timezone: m.timezone,
        callWindows: (m.call_windows as { days: number[]; start: string; end: string }[] | null) ?? [],
        allowedChannels: m.allowed_channels,
        isActive: m.is_active,
      }))}
    />
  );
}
