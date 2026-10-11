"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWritable } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { campaignSchema, parseSpendCsv, type CampaignInput } from "@/lib/marketing/campaign";

import type { ActionResult } from "../settings/types";

// Chiến dịch, ngân sách, chi phí (migration 20261010000100_marketing.sql). Quyền, duyệt ngân sách, nhật ký kiểm ở
// database trong save_campaign, request_campaign_budget, record_campaign_spend.

const DB_ERROR: Record<string, string> = {
  budget_not_approved: "Ngân sách chưa được Owner duyệt nên chưa chạy được chiến dịch.",
  "unknown market": "Thị trường không có trong danh sách.",
  "campaign not found": "Không còn chiến dịch này.",
};

function failure(error: { message?: string; code?: string }): ActionResult {
  if (error.message && DB_ERROR[error.message]) return { ok: false, message: DB_ERROR[error.message] };
  if (error.code === "42501")
    return { ok: false, message: "Anh chị chưa được cấp quyền quản lý chiến dịch." };
  if (error.code === "23505") return { ok: false, message: "Đã có chiến dịch khác dùng mã chiến dịch này." };
  return { ok: false, message: "Chưa lưu được, thử lại sau ít phút." };
}

function refresh() {
  revalidatePath("/campaigns");
  revalidatePath("/marketing");
}

export async function saveCampaign(input: CampaignInput): Promise<ActionResult> {
  await requireWritable("marketing.manage");
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dữ liệu chưa đúng." };
  const c = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_campaign", {
    p: {
      id: c.id ?? "",
      name: c.name,
      platform: c.platform,
      external_id: c.externalId,
      market: c.market,
      starts_on: c.startsOn,
      ends_on: c.endsOn,
      note: c.note,
      status: c.status ?? "",
      budget: c.id ? 0 : c.budget,
    },
  });
  if (error) return failure(error);
  refresh();
  return {
    ok: true,
    message: c.id
      ? `Đã lưu ${c.name}`
      : c.budget > 0
        ? `Đã tạo ${c.name}, ngân sách chờ Owner duyệt (hoặc đã áp nếu anh chị có quyền duyệt)`
        : `Đã tạo ${c.name}`,
  };
}

const budgetSchema = z.object({
  id: z.uuid(),
  amount: z.number().int().min(0).max(100_000_000_000),
  reason: z.string().max(500).optional(),
});

export async function requestBudget(input: z.infer<typeof budgetSchema>): Promise<ActionResult> {
  await requireWritable("marketing.manage");
  const p = budgetSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Ngân sách không hợp lệ." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_campaign_budget", {
    p_campaign: p.data.id,
    p_amount: p.data.amount,
    p_reason: p.data.reason,
  });
  if (error) return failure(error);
  refresh();
  return {
    ok: true,
    message: data === "pending" ? "Đã gửi Owner duyệt ngân sách" : "Đã áp ngân sách mới",
  };
}

const spendSchema = z.object({
  campaignId: z.uuid(),
  date: z.iso.date(),
  amount: z.number().int().min(0).max(10_000_000_000),
});

export async function recordSpend(input: z.infer<typeof spendSchema>): Promise<ActionResult> {
  await requireWritable("marketing.manage");
  const p = spendSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Ngày hoặc số tiền chưa đúng." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_campaign_spend", {
    p_rows: [{ campaign_id: p.data.campaignId, date: p.data.date, amount: p.data.amount }],
    p_source: "manual",
  });
  if (error) return failure(error);
  refresh();
  return { ok: true, message: "Đã ghi chi phí" };
}

/**
 * Nhập chi phí từ file CSV: cột Ngày, Chiến dịch (mã trên nền tảng hoặc tên trong CRM), Số tiền. Dòng lỗi, dòng không
 * khớp chiến dịch được báo lại; chỉ ghi khi không có dòng nào lỗi.
 */
export async function importSpendCsv(input: { text: string }): Promise<ActionResult & { errors?: string[] }> {
  await requireWritable("marketing.manage");
  const text = z.string().max(2_000_000).parse(input.text);
  const parsed = parseSpendCsv(text);
  const supabase = await createClient();
  const { data: campaigns } = await supabase.from("campaigns").select("id, name, external_id");
  const match = (key: string) =>
    (campaigns ?? []).find(
      (c) => c.external_id === key || c.name.trim().toLowerCase() === key.trim().toLowerCase(),
    );
  const errors = parsed.errors.map((e) => `Dòng ${e.line}: ${e.message}`);
  const rows: { campaign_id: string; date: string; amount: number }[] = [];
  for (const r of parsed.rows) {
    const c = match(r.campaign);
    if (!c) errors.push(`Dòng ${r.line}: không có chiến dịch "${r.campaign.slice(0, 60)}"`);
    else rows.push({ campaign_id: c.id, date: r.date, amount: r.amount });
  }
  if (errors.length)
    return { ok: false, message: `File có ${errors.length} dòng lỗi, chưa ghi dòng nào.`, errors };
  if (!rows.length) return { ok: false, message: "File chưa có dòng dữ liệu." };
  if (rows.length > 2000) return { ok: false, message: "Mỗi lần nhập tối đa 2.000 dòng." };
  const { data, error } = await supabase.rpc("record_campaign_spend", { p_rows: rows, p_source: "csv" });
  if (error) return failure(error);
  refresh();
  return { ok: true, message: `Đã ghi ${data} dòng chi phí` };
}
