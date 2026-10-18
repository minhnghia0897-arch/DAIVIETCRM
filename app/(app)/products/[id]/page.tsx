import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductLive, type LiveProductDetail } from "@/components/crm/views/product-live";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import { saveProduct } from "../actions";

export const metadata: Metadata = { title: "Sản phẩm · Đại Việt CRM" };

const time = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function Page({ params }: PageProps<"/products/[id]">) {
  const user = await requirePermission("product.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: v } = await supabase
    .from("product_variants")
    .select(
      "id, sku, name, is_active, products!inner(id, name, brand, description, category_id, warranty_months, requires_installation, installation_crew_size, delivery_class, track_serial, is_sellable, is_gift_only, status)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!v) notFound();
  const [prices, cats] = await Promise.all([
    supabase
      .from("price_list_items")
      .select("price, valid_from, created_by, price_lists!inner(is_default)")
      .eq("variant_id", id)
      .eq("price_lists.is_default", true)
      .order("valid_from", { ascending: false })
      .limit(20),
    supabase.from("product_categories").select("id, name").order("sort"),
  ]);
  const now = new Date();
  const priceRows = prices.data ?? [];
  const current = priceRows.find((p) => new Date(p.valid_from) <= now);
  const p = v.products;

  const data: LiveProductDetail = {
    product: {
      id: v.id,
      sku: v.sku,
      name: v.name ? `${p.name} ${v.name}` : p.name,
      categoryId: p.category_id,
      category: cats.data?.find((c) => c.id === p.category_id)?.name ?? null,
      brand: p.brand,
      description: p.description,
      price: current?.price ?? null,
      warrantyMonths: p.warranty_months,
      requiresInstallation: p.requires_installation,
      installationCrewSize: p.installation_crew_size,
      bulky: p.delivery_class === "bulky",
      trackSerial: p.track_serial,
      isSellable: p.is_sellable,
      isGiftOnly: p.is_gift_only,
      active: v.is_active && p.status === "active",
    },
    priceHistory: priceRows.map((r) => ({ price: r.price, from: time.format(new Date(r.valid_from)) })),
    categories: cats.data ?? [],
    perms: {
      manage: user.permissions.has("product.manage") && !user.viewAs,
      price: user.permissions.has("price.manage") && !user.viewAs,
    },
  };
  return <ProductLive data={data} actions={{ saveProduct }} />;
}
