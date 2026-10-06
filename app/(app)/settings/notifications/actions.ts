"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { telegramConfig } from "@/lib/integrations/telegram_bot/config";
import { pickKnownEvents } from "@/lib/notify/events";

import type { ActionResult } from "../types";

// Thông báo Telegram của chính người đang đăng nhập. Mọi thao tác chạy dưới phiên của họ: database kiểm quyền,
// chặn khi đang "Xem như", và ghi nhật ký (migration 20261007000100_telegram.sql).
// Mã liên kết chỉ trả về một lần cho chính chủ, bảng chỉ giữ bản băm; không ghi mã ra log.

const HHMM = /^([01]\d|2[0-3]):(00|30)$/;

export type LinkResult = { ok: true; url: string; minutes: number } | { ok: false; message: string };

/** Sinh link liên kết một lần để người dùng mở bot và bấm Start. */
export async function createTelegramLink(): Promise<LinkResult> {
  const user = await requireUser();
  if (user.viewAs) return { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." };

  const cfg = await telegramConfig(createAdminClient());
  if (!cfg?.botUsername)
    return {
      ok: false,
      message: "Chưa khai tên bot. Owner điền ở Cài đặt → Tích hợp → Thông báo Telegram cho nhân viên.",
    };

  const supabase = await createClient();
  const { data: code, error } = await supabase.rpc("create_telegram_link_code");
  if (error || !code)
    return {
      ok: false,
      message:
        error?.code === "42501"
          ? "Anh chị chưa đăng nhập, hoặc đang xem như người khác."
          : "Chưa tạo được link liên kết, thử lại sau ít phút.",
    };

  revalidatePath("/settings/notifications");
  return { ok: true, url: `https://t.me/${cfg.botUsername}?start=${code}`, minutes: 10 };
}

/** Gỡ liên kết: bot thôi gửi tin cho người này ngay. */
export async function unlinkTelegram(): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_my_telegram_link");
  if (error) return { ok: false, message: "Chưa gỡ được liên kết, thử lại sau ít phút." };
  revalidatePath("/settings/notifications");
  return data
    ? { ok: true, message: "Đã gỡ liên kết Telegram" }
    : { ok: false, message: "Tài khoản này chưa liên kết Telegram." };
}

const prefsSchema = z.object({
  level: z.enum(["short", "detail"]).optional(),
  // Nhận bản vá một sự kiện hoặc cả bộ; sự kiện lạ bị bỏ (pickKnownEvents).
  events: z.record(z.string(), z.boolean()).optional(),
  quiet: z.object({ on: z.boolean(), from: z.string().regex(HHMM), to: z.string().regex(HHMM) }).optional(),
});

/** Lưu mức chi tiết, sự kiện muốn nhận, giờ im lặng. Chỉ sửa được của chính mình (RLS). */
export async function saveNotifyPrefs(input: z.infer<typeof prefsSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." };
  const patch = prefsSchema.parse(input);

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("notification_prefs")
    .select("level, events, quiet_on, quiet_from, quiet_to")
    .eq("user_id", user.id)
    .maybeSingle();

  const events = {
    ...pickKnownEvents(current?.events),
    ...pickKnownEvents(patch.events),
  };
  const { error } = await supabase.from("notification_prefs").upsert(
    {
      user_id: user.id,
      showroom_id: user.showroomId,
      level: patch.level ?? current?.level ?? "short",
      events,
      quiet_on: patch.quiet?.on ?? current?.quiet_on ?? true,
      quiet_from: patch.quiet?.from ?? current?.quiet_from ?? "22:00",
      quiet_to: patch.quiet?.to ?? current?.quiet_to ?? "07:00",
    },
    { onConflict: "user_id" },
  );
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Anh chị không sửa được thiết lập này."
          : "Chưa lưu được thiết lập, thử lại sau ít phút.",
    };
  revalidatePath("/settings/notifications");
  return { ok: true, message: "Đã lưu" };
}
