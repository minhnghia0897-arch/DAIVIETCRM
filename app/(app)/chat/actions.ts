"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWritable } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import type { ActionResult } from "../settings/types";

// Đổi công dụng, tạm ngưng hoặc dùng lại một nhóm Telegram của đội. Quyền và nhật ký kiểm ở database
// (hàm set_telegram_group, migration 20261007000300_telegram_groups_crm.sql).

const schema = z.object({
  chatId: z.string().regex(/^-?\d{1,19}$/, "Mã nhóm không hợp lệ"),
  purpose: z.enum(["general", "delivery", "care", "announce", "unused"]),
  active: z.boolean().default(true),
});

export async function setTelegramGroup(input: z.infer<typeof schema>): Promise<ActionResult> {
  await requireWritable("settings.integrations");
  const p = schema.parse(input);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_telegram_group", {
    p_chat_id: Number(p.chatId),
    p_purpose: p.purpose,
    p_active: p.active,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Anh chị không có quyền sửa nhóm, hoặc đang xem như người khác."
          : error.message.includes("no longer in this group")
            ? "Bot đã rời nhóm này. Thêm bot vào nhóm lại rồi gán công dụng."
            : error.code === "no_data_found"
              ? "Không còn nhóm này trong CRM."
              : "Chưa lưu được, thử lại sau ít phút.",
    };
  revalidatePath("/chat");
  return { ok: true, message: p.purpose === "unused" ? "Đã bỏ công dụng của nhóm" : "Đã lưu công dụng nhóm" };
}
