"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import type { ActionResult } from "../settings/types";

// Xong / Dời / Lỡ hẹn đi qua task_action() — cùng một luật với nút trên Telegram (migration 20261007000600).
// Duyệt đi qua UPDATE approvals: trigger guard_approval_decision kiểm quyền theo loại, chặn tự duyệt, ghi nhật ký.

const taskSchema = z.object({
  id: z.uuid(),
  action: z.enum(["done", "snooze", "miss"]),
  minutes: z.number().int().min(5).max(1440).optional(),
  outcome: z.string().max(500).optional(),
});

const TASK_DONE: Record<string, string> = {
  done: "Đã xong việc",
  snoozed: "Đã dời việc 1 giờ",
  missed: "Đã ghi lỡ hẹn",
};

export async function taskAction(input: z.infer<typeof taskSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." };
  const p = taskSchema.parse(input);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("task_action", {
    p_task_id: p.id,
    p_action: p.action,
    p_minutes: p.minutes ?? 60,
    p_outcome: p.outcome,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Việc này của người khác, anh chị không xử lý được."
          : error.code === "P0002"
            ? "Không còn việc này."
            : "Chưa lưu được, thử lại sau ít phút.",
    };
  revalidatePath("/tasks");
  return { ok: true, message: TASK_DONE[data as string] ?? "Việc này đã xử lý rồi." };
}

const approvalSchema = z.object({
  id: z.uuid(),
  ok: z.boolean(),
  note: z.string().max(500).optional(),
});

export async function decideApproval(input: z.infer<typeof approvalSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." };
  const p = approvalSchema.parse(input);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approvals")
    .update({ status: p.ok ? "approved" : "rejected", decision_note: p.note?.trim() || null })
    .eq("id", p.id)
    .eq("status", "pending")
    .select("id");
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Anh chị không duyệt được đề xuất này (hoặc đây là đề xuất của chính anh chị)."
          : "Chưa lưu được quyết định, thử lại sau ít phút.",
    };
  // Không dòng nào đổi: đã có người quyết trước, hoặc không có quyền (RLS ẩn dòng).
  if (!data?.length) return { ok: false, message: "Đề xuất này đã được xử lý hoặc anh chị không có quyền." };
  revalidatePath("/tasks");
  return { ok: true, message: p.ok ? "Đã duyệt" : "Đã từ chối" };
}
