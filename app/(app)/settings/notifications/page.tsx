import type { Metadata } from "next";

import { NotifySettings, type LiveTelegramGroup } from "@/components/crm/views/notify-settings";
import { requireUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { telegramConfig } from "@/lib/integrations/telegram_bot/config";
import { defaultPrefs, type NotifyEvent, type NotifyPrefs } from "@/lib/notify/events";

import { createTelegramLink, saveNotifyPrefs, unlinkTelegram } from "./actions";

export const metadata: Metadata = { title: "Thông báo Telegram · Đại Việt CRM" };

// Thông báo của chính mình: mọi người dùng. Trạng thái liên kết và thiết lập đọc dưới phiên người đang đăng nhập
// (RLS chỉ cho họ thấy dòng của mình); tên bot đọc bằng khóa bí mật vì cấu hình đấu nối chỉ Owner xem được.
export default async function Page() {
  const user = await requireUser();
  const supabase = await createClient();
  const canSeeGroups = user.permissions.has("settings.integrations");

  const [{ data: link }, { data: prefs }, cfg, { data: groups }] = await Promise.all([
    supabase
      .from("telegram_links")
      .select("username, linked_at")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .maybeSingle(),
    supabase
      .from("notification_prefs")
      .select("level, events, quiet_on, quiet_from, quiet_to")
      .eq("user_id", user.id)
      .maybeSingle(),
    telegramConfig(createAdminClient()),
    canSeeGroups
      ? supabase.from("telegram_groups").select("title, purpose, status").order("created_at")
      : Promise.resolve({ data: [] as LiveTelegramGroup[] }),
  ]);

  const base = defaultPrefs();
  const live: NotifyPrefs = {
    linked: Boolean(link),
    telegram: link?.username ? `@${link.username}` : undefined,
    level: (prefs?.level as NotifyPrefs["level"]) ?? base.level,
    events: {
      ...base.events,
      ...((prefs?.events ?? {}) as Partial<Record<NotifyEvent, boolean>>),
    },
    quiet: {
      on: prefs?.quiet_on ?? base.quiet.on,
      from: prefs?.quiet_from?.slice(0, 5) ?? base.quiet.from,
      to: prefs?.quiet_to?.slice(0, 5) ?? base.quiet.to,
    },
  };

  return (
    <NotifySettings
      live={{
        botUsername: cfg?.botUsername ?? null,
        prefs: live,
        groups: (groups ?? []) as LiveTelegramGroup[],
        canSeeGroups,
        createLink: createTelegramLink,
        unlink: unlinkTelegram,
        savePrefs: saveNotifyPrefs,
      }}
    />
  );
}
