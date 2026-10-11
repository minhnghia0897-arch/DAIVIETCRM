"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import type { ActionResult } from "../settings/types";

// Phiếu kho (migration 20261011000500_sales_flow.sql): tồn chỉ đổi khi phiếu được ghi sổ; kiểm kê lệch chờ duyệt.

const READ_ONLY = { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." } as const;

function friendly(code: string | undefined, message: string | undefined): string {
  switch ((message ?? "").split(":")[0]) {
    case "insufficient_stock":
      return "Kho không đủ hàng cho phiếu này.";
    case "serial_exists":
      return "Có serial đã tồn tại trong hệ thống, kiểm lại danh sách serial.";
    case "document_locked":
      return "Phiếu đã ghi sổ hoặc đã hủy.";
  }
  switch (code) {
    case "42501":
      return "Anh chị chưa được cấp quyền làm việc này.";
    case "P0002":
      return "Không tìm thấy phiếu hoặc kho.";
    case "22023":
      return "Phiếu chưa đúng: kiểm lại kho, SKU và số lượng.";
    default:
      return "Chưa lưu được, thử lại sau ít phút.";
  }
}

const docSchema = z.object({
  kind: z.enum(["receipt", "issue", "transfer", "count"]),
  warehouseId: z.uuid(),
  toWarehouseId: z.uuid().optional(),
  reason: z.string().trim().max(500),
  lines: z
    .array(
      z.object({
        variantId: z.uuid(),
        n: z.number().int().min(0).max(100000),
        serials: z.array(z.string().trim().min(1).max(80)).max(500).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export async function createStockDocument(input: z.infer<typeof docSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = docSchema.safeParse(input);
  if (!p.success) return { ok: false, message: friendly("22023", undefined) };
  const d = p.data;
  if (d.kind !== "count" && d.lines.some((l) => l.n < 1))
    return { ok: false, message: "Số lượng mỗi dòng phải từ 1." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_stock_document", {
    p: {
      kind: d.kind,
      warehouse_id: d.warehouseId,
      to_warehouse_id: d.toWarehouseId,
      reason: d.reason,
      lines: d.lines.map((l) =>
        d.kind === "count"
          ? { variant_id: l.variantId, counted: l.n }
          : { variant_id: l.variantId, qty: l.n, serials: l.serials ?? [] },
      ),
    },
  });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  revalidatePath("/inventory");
  return { ok: true, message: "Đã lập phiếu nháp, chưa đổi tồn" };
}

export async function postStockDocument(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_stock_document", { p_doc_id: z.uuid().parse(id) });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  revalidatePath("/inventory");
  revalidatePath("/tasks");
  return {
    ok: true,
    message:
      data === "pending_approval"
        ? "Kiểm kê có chênh lệch, đã gửi Owner duyệt"
        : "Đã ghi sổ, tồn đã cập nhật",
  };
}

export async function cancelStockDocument(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_stock_document", { p_doc_id: z.uuid().parse(id) });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  revalidatePath("/inventory");
  return { ok: true, message: "Đã hủy phiếu nháp" };
}

export async function setLowThreshold(input: {
  variantId: string;
  warehouseId: string;
  threshold: number | null;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = z
    .object({
      variantId: z.uuid(),
      warehouseId: z.uuid(),
      threshold: z.number().int().min(0).max(100000).nullable(),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, message: "Ngưỡng phải là số không âm." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_low_stock_threshold", {
    p_variant_id: p.data.variantId,
    p_warehouse_id: p.data.warehouseId,
    p_threshold: p.data.threshold as number,
  });
  if (error) return { ok: false, message: friendly(error.code, error.message) };
  revalidatePath("/inventory");
  return { ok: true, message: "Đã lưu ngưỡng tồn thấp" };
}
