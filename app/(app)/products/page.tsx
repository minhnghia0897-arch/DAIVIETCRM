import type { Metadata } from "next";

import { ProductsLive, type LiveProduct } from "@/components/crm/views/products-live";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import { importProducts, saveProduct } from "./actions";

export const metadata: Metadata = { title: "Sản phẩm · Đại Việt CRM" };

// Danh mục sản phẩm thật: SKU, giá bán hiện hành (bảng giá mặc định), tồn khả dụng theo kho.
export default async function Page() {
  const user = await requirePermission("product.view");
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [variants, prices, levels, cats, warehouses] = await Promise.all([
    supabase
      .from("product_variants")
      .select(
        "id, sku, name, is_active, products!inner(id, name, brand, description, category_id, warranty_months, requires_installation, installation_crew_size, delivery_class, track_serial, is_sellable, is_gift_only, status)",
      )
      .order("sku"),
    supabase
      .from("price_list_items")
      .select("variant_id, price, valid_from, price_lists!inner(is_default)")
      .eq("price_lists.is_default", true)
      .lte("valid_from", nowIso)
      .order("valid_from", { ascending: false }),
    supabase.from("stock_levels").select("variant_id, warehouse_id, available"),
    supabase.from("product_categories").select("id, name").order("sort"),
    supabase.from("warehouses").select("id, name, is_display").eq("is_active", true).order("sort"),
  ]);
  const priceOf = new Map<string, number>();
  for (const p of prices.data ?? []) if (!priceOf.has(p.variant_id)) priceOf.set(p.variant_id, p.price);
  const sellable = (warehouses.data ?? []).filter((w) => !w.is_display).map((w) => w.id);

  const rows: LiveProduct[] = (variants.data ?? []).map((v) => ({
    id: v.id,
    sku: v.sku,
    name: v.name ? `${v.products.name} ${v.name}` : v.products.name,
    categoryId: v.products.category_id,
    category: cats.data?.find((c) => c.id === v.products.category_id)?.name ?? null,
    brand: v.products.brand,
    description: v.products.description,
    price: priceOf.get(v.id) ?? null,
    warrantyMonths: v.products.warranty_months,
    requiresInstallation: v.products.requires_installation,
    installationCrewSize: v.products.installation_crew_size,
    bulky: v.products.delivery_class === "bulky",
    trackSerial: v.products.track_serial,
    isSellable: v.products.is_sellable,
    isGiftOnly: v.products.is_gift_only,
    active: v.is_active && v.products.status === "active",
    available: (levels.data ?? [])
      .filter((l) => l.variant_id === v.id && sellable.includes(l.warehouse_id))
      .reduce((s, l) => s + (l.available ?? 0), 0),
  }));

  return (
    <ProductsLive
      rows={rows}
      categories={cats.data ?? []}
      perms={{
        manage: user.permissions.has("product.manage") && !user.viewAs,
        price: user.permissions.has("price.manage") && !user.viewAs,
      }}
      actions={{ saveProduct, importProducts }}
    />
  );
}
