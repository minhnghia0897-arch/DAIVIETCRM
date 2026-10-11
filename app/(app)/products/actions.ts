"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { parseProductCsv } from "@/lib/sales/product-csv";

import type { ActionResult } from "../settings/types";

// Sản phẩm, SKU, giá (migration 20261011000500_sales_flow.sql): sửa sản phẩm cần product.manage, đổi giá cần
// price.manage; giá cũ giữ trong lịch sử, đơn cũ đã chụp giá nên không đổi.

const READ_ONLY = { ok: false, message: "Đang xem như người dùng khác, chỉ đọc." } as const;

function friendly(code: string | undefined, message: string | undefined): string {
  if ((message ?? "").startsWith("sku_taken")) return "Mã SKU này đã có, chọn mã khác.";
  switch (code) {
    case "42501":
      return "Anh chị chưa được cấp quyền sửa sản phẩm hoặc giá.";
    case "P0002":
      return "Không tìm thấy sản phẩm.";
    case "22023":
      return "Thông tin sản phẩm chưa đúng, kiểm lại SKU, tên, giá.";
    default:
      return "Chưa lưu được, thử lại sau ít phút.";
  }
}

const productSchema = z.object({
  id: z.uuid().optional(),
  sku: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  categoryId: z.uuid().nullable(),
  brand: z.string().trim().max(80),
  description: z.string().trim().max(2000),
  warrantyMonths: z.number().int().min(0).max(240).nullable(),
  requiresInstallation: z.boolean(),
  installationCrewSize: z.number().int().min(1).max(10).nullable(),
  bulky: z.boolean(),
  trackSerial: z.boolean(),
  isSellable: z.boolean(),
  isGiftOnly: z.boolean(),
  active: z.boolean(),
  price: z.number().int().min(0).max(10_000_000_000).nullable(),
});

export type ProductInput = z.infer<typeof productSchema>;

export async function saveProduct(input: ProductInput): Promise<ActionResult & { id?: string }> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  const p = productSchema.safeParse(input);
  if (!p.success) return { ok: false, message: friendly("22023", undefined) };
  const d = p.data;
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("save_product", {
    p: {
      id: d.id,
      sku: d.sku,
      name: d.name,
      category_id: d.categoryId ?? "",
      brand: d.brand,
      description: d.description,
      warranty_months: d.warrantyMonths ?? "",
      requires_installation: d.requiresInstallation,
      installation_crew_size: d.installationCrewSize ?? "",
      delivery_class: d.bulky ? "bulky" : "parcel",
      track_serial: d.trackSerial,
      is_sellable: d.isSellable,
      is_gift_only: d.isGiftOnly,
      status: d.active ? "active" : "inactive",
      is_active: d.active,
    },
  });
  if (error || !id) return { ok: false, message: friendly(error?.code, error?.message) };
  if (d.price !== null && user.permissions.has("price.manage")) {
    const { error: priceErr } = await supabase.rpc("set_price", { p_variant_id: id, p_price: d.price });
    if (priceErr)
      return {
        ok: false,
        message: `Đã lưu sản phẩm nhưng chưa lưu giá: ${friendly(priceErr.code, priceErr.message)}`,
      };
  }
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  return { ok: true, id, message: d.id ? "Đã lưu sản phẩm" : "Đã thêm sản phẩm" };
}

export async function importProducts(
  form: FormData,
): Promise<ActionResult & { errors?: { line: number; message: string }[] }> {
  const user = await requireUser();
  if (user.viewAs) return READ_ONLY;
  if (!user.permissions.has("product.manage"))
    return { ok: false, message: "Anh chị chưa được cấp quyền sửa sản phẩm." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Chọn file CSV để nhập." };
  if (file.size > 2 * 1024 * 1024) return { ok: false, message: "File tối đa 2MB." };
  const { rows, errors } = parseProductCsv(await file.text());
  if (!rows.length) return { ok: false, message: "Không có dòng nào nhập được.", errors };

  const supabase = await createClient();
  const [{ data: cats }, { data: existing }] = await Promise.all([
    supabase.from("product_categories").select("id, name"),
    supabase.from("product_variants").select("id, sku"),
  ]);
  const catId = (name: string | null) =>
    name ? (cats?.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null) : null;
  const canPrice = user.permissions.has("price.manage");
  let saved = 0;
  const failed = [...errors];
  for (const r of rows) {
    const id = existing?.find((v) => v.sku === r.sku)?.id;
    const { data: vid, error } = await supabase.rpc("save_product", {
      p: {
        id,
        sku: r.sku,
        name: r.name,
        ...(r.category ? { category_id: catId(r.category) ?? "" } : {}),
        ...(r.brand ? { brand: r.brand } : {}),
        ...(r.warrantyMonths !== null ? { warranty_months: r.warrantyMonths } : {}),
        requires_installation: r.requiresInstallation,
        delivery_class: r.bulky ? "bulky" : "parcel",
        track_serial: r.trackSerial,
      },
    });
    if (error || !vid) {
      failed.push({ line: r.line, message: friendly(error?.code, error?.message) });
      continue;
    }
    if (r.price !== null && canPrice) {
      const { error: priceErr } = await supabase.rpc("set_price", { p_variant_id: vid, p_price: r.price });
      if (priceErr)
        failed.push({ line: r.line, message: `giá: ${friendly(priceErr.code, priceErr.message)}` });
    }
    if (r.category && !catId(r.category))
      failed.push({ line: r.line, message: `nhóm "${r.category}" chưa có, để trống` });
    saved++;
  }
  revalidatePath("/products");
  return {
    ok: saved > 0,
    message: `Đã nhập ${saved} sản phẩm${failed.length ? `, ${failed.length} dòng cần xem lại` : ""}`,
    errors: failed.sort((a, b) => a.line - b.line),
  };
}
