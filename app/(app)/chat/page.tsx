import type { Metadata } from "next";

import { TelegramGroups, type LiveGroup } from "@/components/crm/views/telegram-groups";
import { requireUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { telegramConfig } from "@/lib/integrations/telegram_bot/config";

import { setTelegramGroup } from "./actions";

export const metadata: Metadata = { title: "Nhóm nội bộ · Đại Việt CRM" };

// Nhóm nội bộ của đội nằm trên Telegram. Màn này là phần kiểm soát ở CRM: nhóm nào đã nối, dùng vào việc gì,
// còn hoạt động không, CRM đã đăng tin gì vào nhóm. CRM không đọc trò chuyện của đội (CLAUDE.md mục 10.3).
export default async function Page() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: groups }, cfg] = await Promise.all([
    supabase
      .from("telegram_groups")
      .select("chat_id, title, purpose, status, assigned_at, profiles(full_name)")
      .order("status")
      .order("title"),
    telegramConfig(createAdminClient()),
  ]);

  // Tin CRM đã đăng vào các nhóm này (bot không đọc tin của người trong nhóm).
  const chatIds = (groups ?? []).map((g) => g.chat_id);
  const { data: posts } = chatIds.length
    ? await supabase
        .from("telegram_messages")
        .select("chat_id, event_type, created_at")
        .in("chat_id", chatIds)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] };

  const byChat = new Map<string, LiveGroup["posts"]>();
  for (const p of posts ?? []) {
    const key = String(p.chat_id);
    const list = byChat.get(key) ?? [];
    if (list.length < 20) list.push({ at: p.created_at, eventType: p.event_type });
    byChat.set(key, list);
  }

  return (
    <TelegramGroups
      live={{
        canManage: user.permissions.has("settings.integrations") && !user.viewAs,
        botUsername: cfg?.botUsername ?? null,
        groups: (groups ?? []).map((g) => ({
          chatId: String(g.chat_id),
          title: g.title,
          purpose: g.purpose,
          status: g.status,
          assignedBy: g.profiles?.full_name ?? null,
          assignedAt: g.assigned_at,
          posts: byChat.get(String(g.chat_id)) ?? [],
        })),
        setGroup: setTelegramGroup,
      }}
    />
  );
}
