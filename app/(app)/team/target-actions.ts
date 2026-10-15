"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { monthLabel, shiftMonth } from "@/lib/sales/credits";

import type { ActionResult } from "../settings/types";

// Chỉ tiêu doanh số tháng (CLAUDE.md mục 9.3; migration 20261015000100_sales_credits.sql). Quyền thật kiểm ở hàm
// set_sales_target (target.manage, không cho khi đang Xem như); ở đây kiểm đầu vào và đổi lỗi sang câu dễ hiểu.

const READ_ONLY = { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." } as const;
const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/);

async function guard() {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  if (!user.permissions.has("target.manage"))
    return { ok: false, message: "Anh chị chưa có quyền đặt chỉ tiêu." } as const;
  return null;
}

function refresh() {
  revalidatePath("/team", "layout");
  revalidatePath("/home");
}

/** Đặt, sửa chỉ tiêu doanh số tháng của một người; 0 hoặc để trống là bỏ chỉ tiêu. */
export async function setSalesTarget(input: {
  userId: string;
  month: string;
  value: number;
}): Promise<ActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = z
    .object({ userId: z.uuid(), month: MONTH, value: z.number().int().min(0).max(1_000_000_000_000) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Chỉ tiêu chưa hợp lệ, nhập số tiền từ 0 trở lên." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_sales_target", {
    p_user: parsed.data.userId,
    p_month: parsed.data.month,
    p_value: parsed.data.value,
  });
  if (error) return { ok: false, message: "Chưa lưu được chỉ tiêu, thử lại sau ít phút." };
  refresh();
  return {
    ok: true,
    message: parsed.data.value
      ? "Đã lưu chỉ tiêu"
      : `Đã bỏ chỉ tiêu ${monthLabel(parsed.data.month).toLowerCase()}`,
  };
}

/** Chép chỉ tiêu tháng trước sang tháng đang xem cho người chưa có chỉ tiêu. */
export async function copyPreviousTargets(month: string): Promise<ActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;
  const m = MONTH.safeParse(month);
  if (!m.success) return { ok: false, message: "Tháng chưa hợp lệ." };
  const supabase = await createClient();
  const [{ data: prev }, { data: cur }] = await Promise.all([
    supabase.rpc("sales_kpi_month", { p_month: shiftMonth(m.data, -1) }),
    supabase.rpc("sales_kpi_month", { p_month: m.data }),
  ]);
  const todo = (prev ?? []).filter(
    (p) => p.target && !(cur ?? []).some((c) => c.user_id === p.user_id && c.target),
  );
  if (!todo.length)
    return {
      ok: false,
      message: "Không có chỉ tiêu nào để chép: tháng trước chưa đặt hoặc tháng này đã đặt đủ.",
    };
  for (const p of todo) {
    const { error } = await supabase.rpc("set_sales_target", {
      p_user: p.user_id,
      p_month: m.data,
      p_value: p.target!,
    });
    if (error) return { ok: false, message: "Chép chưa xong, thử lại sau ít phút." };
  }
  refresh();
  return { ok: true, message: `Đã chép chỉ tiêu cho ${todo.length} người` };
}
