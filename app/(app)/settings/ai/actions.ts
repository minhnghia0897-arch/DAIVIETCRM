"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { previewAiReply } from "@/lib/ai/auto-reply";
import { vnd } from "@/lib/ai/prompt";
import { requireWritable } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";

import type { ActionResult } from "../types";

// Cài đặt, Trợ lý AI (Owner chốt 12/10/2026): bật tắt tự trả lời theo kênh, kiến thức cho AI, hỏi thử. Database kiểm
// settings.integrations (RLS của integrations, ai_knowledge); chặn khi "Xem như".

const channelsSchema = z.object({ channels: z.array(z.enum(["messenger", "zalo"])).max(2) });

export async function setAutoReplyChannels(input: z.infer<typeof channelsSchema>): Promise<ActionResult> {
  const user = await requireWritable("settings.integrations");
  const { channels } = channelsSchema.parse(input);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("integrations")
    .select("config, status")
    .eq("showroom_id", user.showroomId)
    .eq("key", "ai_llm")
    .maybeSingle();
  if (!row || row.status === "not_connected")
    return {
      ok: false,
      message: "Chưa kết nối Trợ lý AI. Dán API key ở Cài đặt, Tích hợp, Trợ lý AI trước.",
    };
  const config = { ...((row.config ?? {}) as Record<string, unknown>), autoReply: [...new Set(channels)] };
  const { error } = await supabase
    .from("integrations")
    .update({ config: config as never })
    .eq("showroom_id", user.showroomId)
    .eq("key", "ai_llm");
  if (error) return { ok: false, message: "Chưa lưu được, thử lại sau ít phút." };
  revalidatePath("/settings/ai");
  revalidatePath("/inbox");
  const label = channels.map((c) => (c === "zalo" ? "Zalo OA" : "Tin nhắn Facebook")).join(", ");
  return { ok: true, message: channels.length ? `AI tự trả lời trên ${label}` : "Đã tắt AI tự trả lời" };
}

const knowledgeSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Chưa nhập tiêu đề").max(120, "Tiêu đề dài quá 120 ký tự"),
  body: z.string().trim().min(1, "Chưa nhập nội dung").max(8000, "Nội dung dài quá 8.000 ký tự"),
  isActive: z.boolean().default(true),
  sort: z.number().int().min(0).max(10_000).default(0),
});

export async function saveKnowledge(input: z.input<typeof knowledgeSchema>): Promise<ActionResult> {
  const user = await requireWritable("settings.integrations");
  const p = knowledgeSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Dữ liệu chưa đúng." };
  const { id, title, body, isActive, sort } = p.data;
  const supabase = await createClient();
  const row = { title, body, is_active: isActive, sort };
  const { error } = id
    ? await supabase.from("ai_knowledge").update(row).eq("id", id)
    : await supabase.from("ai_knowledge").insert({ ...row, showroom_id: user.showroomId });
  if (error) return { ok: false, message: "Chưa lưu được kiến thức, thử lại sau ít phút." };
  revalidatePath("/settings/ai");
  return { ok: true, message: id ? "Đã lưu, AI dùng từ tin sau" : "Đã thêm kiến thức cho AI" };
}

export async function deleteKnowledge(input: { id: string }): Promise<ActionResult> {
  await requireWritable("settings.integrations");
  const { id } = z.object({ id: z.uuid() }).parse(input);
  const supabase = await createClient();
  const { error } = await supabase.from("ai_knowledge").delete().eq("id", id);
  if (error) return { ok: false, message: "Chưa xóa được, thử lại sau ít phút." };
  revalidatePath("/settings/ai");
  return { ok: true, message: "Đã xóa" };
}

export interface PreviewResult {
  ok: boolean;
  message: string;
  action?: "reply" | "handoff" | "none";
  reply?: string;
  reason?: string | null;
  createLead?: boolean;
  summary?: string;
}

/** Hỏi thử: AI trả lời một tin mẫu như thật nhưng không gửi cho ai (tốn chi phí như một lượt thật). */
export async function previewAi(input: { text: string }): Promise<PreviewResult> {
  const user = await requireWritable("settings.integrations");
  const p = z.object({ text: z.string().trim().min(1).max(2000) }).safeParse(input);
  if (!p.success) return { ok: false, message: "Nhập tin của khách để hỏi thử (tối đa 2.000 ký tự)." };
  const r = await previewAiReply(createAdminClient(), user.showroomId, p.data.text);
  if (!r.ok) return { ok: false, message: r.message };
  return {
    ok: true,
    message: `AI đã trả lời thử (${r.model}, khoảng ${vnd(r.costVnd)})`,
    action: r.decision.action,
    reply: r.decision.reply,
    reason: r.decision.reason,
    createLead: r.decision.createLead,
    summary: r.decision.summary,
  };
}
