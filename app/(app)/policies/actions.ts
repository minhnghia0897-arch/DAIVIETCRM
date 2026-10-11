"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import type { Json } from "@/lib/db/types";
import { POLICY_TYPES, RULES_SCHEMA, type PolicyType } from "@/lib/sales/policy-rules";

import type { ActionResult } from "../settings/types";

// Chính sách (CLAUDE.md 8.5): quy tắc kiểm bằng schema zod theo loại trước khi lưu; database tạo phiên bản mới khi
// sửa chính sách đã từng chạy, đơn cũ giữ phiên bản đã áp.

const READ_ONLY = { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." } as const;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const baseSchema = z.object({
  policyKey: z.uuid().optional(),
  type: z.enum(POLICY_TYPES),
  name: z.string().trim().min(1).max(200),
  status: z.enum(["draft", "active", "paused", "expired"]),
  validFrom: date,
  validTo: date.nullable(),
  channels: z.array(z.string().min(1).max(40)).max(10),
  priority: z.number().int().min(-100).max(100),
  stackable: z.boolean(),
  rules: z.unknown(),
});

export type PolicyInput = z.infer<typeof baseSchema>;

export async function savePolicy(input: PolicyInput): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = baseSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Thông tin chính sách chưa đủ: tên, loại, ngày bắt đầu." };
  const d = p.data;
  if (d.validTo && d.validTo < d.validFrom)
    return { ok: false, message: "Ngày kết thúc phải sau ngày bắt đầu." };
  const rules = RULES_SCHEMA[d.type as PolicyType].safeParse(d.rules);
  if (!rules.success)
    return {
      ok: false,
      message: `Nội dung chính sách chưa đúng: ${rules.error.issues[0]?.message ?? "kiểm lại"}`,
    };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_policy", {
    p: {
      policy_key: d.policyKey,
      type: d.type,
      name: d.name,
      status: d.status,
      valid_from: d.validFrom,
      valid_to: d.validTo ?? "",
      channels: d.channels.length ? d.channels : null,
      priority: d.priority,
      stackable: d.stackable,
      rules: rules.data,
    } as unknown as Json,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Anh chị chưa được cấp quyền sửa chính sách."
          : "Chưa lưu được, thử lại sau ít phút.",
    };
  revalidatePath("/policies");
  return { ok: true, message: d.policyKey ? "Đã lưu chính sách" : "Đã tạo chính sách" };
}

export async function setPolicyStatus(input: { policyKey: string; status: string }): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = z
    .object({ policyKey: z.uuid(), status: z.enum(["draft", "active", "paused", "expired"]) })
    .parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_policy_status", {
    p_policy_key: p.policyKey,
    p_status: p.status,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Anh chị chưa được cấp quyền sửa chính sách."
          : "Chưa lưu được, thử lại sau ít phút.",
    };
  revalidatePath("/policies");
  return { ok: true, message: p.status === "active" ? "Đã bật chính sách" : "Đã đổi trạng thái chính sách" };
}

const comboSchema = z.object({
  id: z.uuid().optional(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000),
  pricingMode: z.enum(["fixed_price", "sum_minus"]),
  amount: z.number().int().min(0).max(10_000_000_000),
  validFrom: date.nullable(),
  validTo: date.nullable(),
  active: z.boolean(),
  items: z
    .array(z.object({ variantId: z.uuid(), qty: z.number().int().min(1).max(99), isGift: z.boolean() }))
    .min(1)
    .max(20),
});

export async function saveCombo(input: z.infer<typeof comboSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = comboSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Combo cần mã, tên, giá và ít nhất một sản phẩm." };
  const d = p.data;
  if (d.items.every((i) => i.isGift))
    return { ok: false, message: "Combo cần ít nhất một món bán (không phải quà)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_combo", {
    p: {
      id: d.id,
      code: d.code,
      name: d.name,
      description: d.description,
      pricing_mode: d.pricingMode,
      price: d.pricingMode === "fixed_price" ? d.amount : null,
      discount: d.pricingMode === "sum_minus" ? d.amount : null,
      valid_from: d.validFrom ?? "",
      valid_to: d.validTo ?? "",
      status: d.active ? "active" : "inactive",
      items: d.items.map((i) => ({ variant_id: i.variantId, qty: i.qty, is_gift: i.isGift })),
    } as unknown as Json,
  });
  if (error)
    return {
      ok: false,
      message: (error.message ?? "").startsWith("code_taken")
        ? "Mã combo đã có, chọn mã khác."
        : error.code === "42501"
          ? "Anh chị chưa được cấp quyền sửa combo."
          : "Chưa lưu được, thử lại sau ít phút.",
    };
  revalidatePath("/policies");
  revalidatePath("/inventory");
  return { ok: true, message: d.id ? "Đã lưu combo" : "Đã tạo combo" };
}
