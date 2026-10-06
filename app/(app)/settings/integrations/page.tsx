import type { Metadata } from "next";

import { IntegrationSettings, type LiveIntegrationRow } from "@/components/crm/views/integrations";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import type { IntegrationStatus } from "@/lib/integrations/connection";

import { removeIntegrationSecret, saveIntegrationSecrets, saveIntegrationSettings } from "./actions";

export const metadata: Metadata = { title: "Tích hợp · Đại Việt CRM" };

// Trạng thái, cấu hình đọc từ bảng `integrations`; khóa chỉ đọc tên và ngày cập nhật từ `integration_secrets`
// (giá trị nằm trong Supabase Vault, không bao giờ gửi xuống trình duyệt).
export default async function Page() {
  await requirePermission("settings.integrations");
  const supabase = await createClient();
  const [{ data: rows }, { data: secrets }] = await Promise.all([
    supabase.from("integrations").select("key, status, config, prerequisites_done, reply_mode"),
    supabase.from("integration_secrets").select("integration_key, name, updated_at"),
  ]);
  const live: Record<string, LiveIntegrationRow> = {};
  for (const r of rows ?? []) {
    live[r.key] = {
      status: r.status as IntegrationStatus,
      config: (r.config ?? {}) as Record<string, unknown>,
      prerequisitesDone: Object.keys((r.prerequisites_done ?? {}) as Record<string, unknown>),
      replyMode: (r.reply_mode ?? undefined) as LiveIntegrationRow["replyMode"],
      secrets: {},
    };
  }
  for (const s of secrets ?? []) {
    live[s.integration_key] ??= {
      status: "not_connected",
      config: {},
      prerequisitesDone: [],
      secrets: {},
    };
    live[s.integration_key].secrets[s.name] = s.updated_at;
  }
  return (
    <IntegrationSettings
      live={{
        rows: live,
        saveSecrets: saveIntegrationSecrets,
        removeSecret: removeIntegrationSecret,
        saveSettings: saveIntegrationSettings,
      }}
    />
  );
}
