import type { Metadata } from "next";

import { GiftsLive, type LiveGift } from "@/components/crm/views/gifts-live";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import { saveProduct } from "../products/actions";

export const metadata: Metadata = { title: "Quà tặng · Đại Việt CRM" };

// Danh mục Quà tặng riêng (Owner chốt 18/10/2026): sản phẩm chỉ làm quà tặng, tặng kèm khi lên đơn giá 0đ.
export default async function Page() {
  const user = await requirePermission("product.view");
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [variants, prices, cats] = await Promise.all([
    supabase
      .from("product_variants")
      .select(
        "id, sku, name, is_active, products!inner(name, description, warranty_months, is_gift_only, status)",
      )
      .eq("products.is_gift_only", true)
      .order("sku"),
    supabase
      .from("price_list_items")
      .select("variant_id, price, valid_from, price_lists!inner(is_default)")
      .eq("price_lists.is_default", true)
      .lte("valid_from", nowIso)
      .order("valid_from", { ascending: false }),
    supabase.from("product_categories").select("id, name").order("sort"),
  ]);
  const priceOf = new Map<string, number>();
  for (const p of prices.data ?? []) if (!priceOf.has(p.variant_id)) priceOf.set(p.variant_id, p.price);

  const rows: LiveGift[] = (variants.data ?? [])
    .map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name ? `${v.products.name} ${v.name}` : v.products.name,
      description: v.products.description,
      value: priceOf.get(v.id) ?? null,
      warrantyMonths: v.products.warranty_months,
      active: v.is_active && v.products.status === "active",
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "vi"));

  return (
    <GiftsLive
      rows={rows}
      categoryId={cats.data?.find((c) => c.name === "Quà tặng kèm")?.id ?? null}
      perms={{
        manage: user.permissions.has("product.manage") && !user.viewAs,
        price: user.permissions.has("price.manage") && !user.viewAs,
      }}
      actions={{ saveProduct }}
    />
  );
}
