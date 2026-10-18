"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import type { ActionResult } from "../types";

// Cài đặt, Bán hàng (CLAUDE.md 11.2): mức cọc, hạn báo giá, thông tin chuyển khoản cho khách,
// ngày gọi hỏi thăm sau giao, số ngày không tương tác thì khách Ngủ đông, giới hạn giảm tay theo vai trò. Database kiểm settings.integrations.

const READ_ONLY = { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." } as const;

const schema = z.object({
  depositMinAmount: z.number().int().min(0).max(10_000_000_000),
  depositMinPct: z.number().min(0).max(100),
  holdDays: z.number().int().min(1).max(90),
  quoteValidDays: z.number().int().min(1).max(90),
  postDeliveryCallDays: z.number().int().min(0).max(60),
  dormantDays: z.number().int().min(30).max(1095),
  bankInfo: z.string().trim().max(1000),
});

export async function saveSalesSettings(input: z.infer<typeof schema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = schema.safeParse(input);
  if (!p.success)
    return {
      ok: false,
      message: "Giá trị chưa đúng: kiểm lại mức cọc, số ngày (Ngủ đông từ 30 đến 1095 ngày).",
    };
  const d = p.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_sales_settings", {
    p: {
      deposit_min_amount: d.depositMinAmount,
      deposit_min_pct: d.depositMinPct,
      hold_days: d.holdDays,
      quote_valid_days: d.quoteValidDays,
      post_delivery_call_days: d.postDeliveryCallDays,
      dormant_days: d.dormantDays,
      bank_info: d.bankInfo,
    },
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Chỉ Owner sửa được cài đặt bán hàng."
          : "Chưa lưu được, thử lại sau ít phút.",
    };
  revalidatePath("/settings/sales");
  revalidatePath("/customers");
  return { ok: true, message: "Đã lưu cài đặt bán hàng, áp cho đơn tạo từ giờ" };
}

export async function saveDiscountLimit(input: {
  roleId: string;
  maxPct: number | null;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = z.object({ roleId: z.uuid(), maxPct: z.number().min(0).max(100).nullable() }).safeParse(input);
  if (!p.success) return { ok: false, message: "Giới hạn giảm từ 0 đến 100%." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_discount_limit", {
    p_role_id: p.data.roleId,
    p_max_pct: p.data.maxPct as number,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "42501" ? "Chỉ Owner sửa được giới hạn giảm." : "Chưa lưu được, thử lại sau ít phút.",
    };
  revalidatePath("/settings/sales");
  return { ok: true, message: "Đã lưu giới hạn giảm" };
}
