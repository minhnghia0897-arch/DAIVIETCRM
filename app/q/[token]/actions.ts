"use server";

import { z } from "zod";

import { createAdminClient } from "@/lib/db/admin";
import { acceptQuote } from "@/lib/sales/checkout-server";

// Khách bấm "Đồng ý báo giá" trên trang công khai: chỉ cần mã báo giá (khó đoán). Server định giá lại; giá đổi thì không
// tạo đơn mà báo người bán gửi báo giá mới.
export async function acceptByToken(token: string): Promise<{ ok: boolean; message: string }> {
  const t = z
    .string()
    .regex(/^[0-9a-f]{36}$/)
    .safeParse(token);
  if (!t.success) return { ok: false, message: "Không tìm thấy báo giá." };
  const { data: q } = await createAdminClient().from("quotes").select("id").eq("token", t.data).maybeSingle();
  if (!q) return { ok: false, message: "Không tìm thấy báo giá." };
  const r = await acceptQuote(q.id, true);
  if (r.ok)
    return {
      ok: true,
      message: "Cảm ơn anh chị đã đồng ý. Nhân viên showroom sẽ liên hệ xác nhận đơn và hướng dẫn đặt cọc.",
    };
  if (r.error === "quote_changed")
    return {
      ok: false,
      message: "Giá đã thay đổi so với báo giá này. Nhân viên showroom sẽ gửi anh chị báo giá mới.",
    };
  if (r.error === "quote_closed")
    return { ok: false, message: "Báo giá đã hết hạn hoặc đã được xác nhận trước đó." };
  return { ok: false, message: "Chưa ghi nhận được, anh chị vui lòng nhắn showroom để được hỗ trợ." };
}
