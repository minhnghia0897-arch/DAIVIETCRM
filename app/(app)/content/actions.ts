"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWritable } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { CONTENT_STAGES, contentSchema, type ContentInput } from "@/lib/marketing/content";

import type { ActionResult } from "../settings/types";

// Lịch nội dung (migration 20261010000200_content_calendar.sql). Quyền, luật cột, nhật ký kiểm ở database.

const DB_ERROR: Record<string, string> = {
  publish_at_required: "Cần ngày giờ đăng trước khi lên lịch.",
  review_checks_required: "Cần tick hai mục kiểm nội dung trước khi lên lịch.",
  post_url_required: "Cần link bài đã đăng.",
  "content not found": "Không còn bài này.",
  "unknown market": "Thị trường không có trong danh sách.",
  "unknown campaign": "Không còn chiến dịch này.",
};

function failure(error: { message?: string; code?: string }): ActionResult {
  if (error.message && DB_ERROR[error.message]) return { ok: false, message: DB_ERROR[error.message] };
  if (error.code === "42501") return { ok: false, message: "Anh chị chưa được cấp quyền sửa lịch nội dung." };
  if (error.code === "23514") return { ok: false, message: "Link phải bắt đầu bằng https://." };
  return { ok: false, message: "Chưa lưu được, thử lại sau ít phút." };
}

export async function saveContent(input: ContentInput): Promise<ActionResult> {
  await requireWritable("marketing.manage");
  const parsed = contentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dữ liệu chưa đúng." };
  const c = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_content_item", {
    p: {
      id: c.id ?? "",
      title: c.title,
      channel: c.channel,
      format: c.format,
      status: c.status ?? "",
      owner_id: c.ownerId,
      publish_at: c.publishAt,
      market: c.market,
      product: c.product,
      campaign_id: c.campaignId,
      draft_url: c.draftUrl,
      post_url: c.postUrl,
      note: c.note,
      review_checks: c.checks,
    },
  });
  if (error) return failure(error);
  revalidatePath("/content");
  return { ok: true, message: c.id ? `Đã lưu ${c.title}` : `Đã thêm ${c.title}` };
}

const moveSchema = z.object({
  id: z.uuid(),
  status: z.enum(CONTENT_STAGES.map((s) => s.key) as [string, ...string[]]),
  before: z.uuid().nullable().optional(),
  postUrl: z.string().trim().max(2000).optional(),
});

export async function moveContent(input: z.infer<typeof moveSchema>): Promise<ActionResult> {
  await requireWritable("marketing.manage");
  const p = moveSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Dữ liệu chưa đúng." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_content_item", {
    p_id: p.data.id,
    p_status: p.data.status,
    p_before: p.data.before ?? undefined,
    p_post_url: p.data.postUrl || undefined,
  });
  if (error) return failure(error);
  revalidatePath("/content");
  const label = CONTENT_STAGES.find((s) => s.key === p.data.status)?.label;
  return { ok: true, message: `Đã chuyển sang ${label}` };
}

export async function deleteContent(input: { id: string }): Promise<ActionResult> {
  await requireWritable("marketing.manage");
  const id = z.uuid().parse(input.id);
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_content_item", { p_id: id });
  if (error) return failure(error);
  revalidatePath("/content");
  return { ok: true, message: "Đã xóa bài khỏi lịch" };
}
