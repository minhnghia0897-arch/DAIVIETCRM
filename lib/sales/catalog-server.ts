import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";

import type { Policy, PricingCatalog } from "./pricing";
import { toPricingPolicy, type PolicyRow } from "./policy-rules";

// Nạp danh mục cho hàm định giá từ database: SKU và giá hiện hành, combo, chính sách đang là phiên bản hiện tại, tồn
// khả dụng ở kho mặc định. Khi chưa bật chính sách đặt cọc, giới hạn giảm thì dùng Cài đặt, Bán hàng làm mặc định.

type Db = SupabaseClient<Database>;

export interface LoadedCatalog {
  catalog: PricingCatalog;
  /** SKU bán được, để hiện ở màn Lên đơn. */
  products: { variantId: string; sku: string; name: string; price: number }[];
  combos: { id: string; code: string; name: string }[];
  /** Chính sách dạng chữ (thanh toán, bảo hành, đổi trả) đang áp, hiện trên báo giá. */
  notes: { type: string; name: string; text: string }[];
}

export async function loadCatalog(db: Db, showroomId: string, at = new Date()): Promise<LoadedCatalog> {
  const nowIso = at.toISOString();
  const [variants, prices, combos, policies, settings, limits, roles, levels, warehouses] = await Promise.all(
    [
      db
        .from("product_variants")
        .select(
          "id, sku, name, is_active, products!inner(name, category_id, delivery_class, status, is_sellable, deleted_at)",
        )
        .eq("showroom_id", showroomId),
      db
        .from("price_list_items")
        .select("variant_id, price, valid_from, price_lists!inner(is_default)")
        .eq("showroom_id", showroomId)
        .eq("price_lists.is_default", true)
        .lte("valid_from", nowIso)
        .order("valid_from", { ascending: false }),
      db
        .from("combos")
        .select(
          "id, code, name, pricing_mode, price, discount, valid_from, valid_to, channels, status, combo_items(variant_id, qty, is_gift)",
        )
        .eq("showroom_id", showroomId)
        .eq("status", "active"),
      db
        .from("policies")
        .select(
          "id, policy_key, version, type, name, status, valid_from, valid_to, channels, priority, stackable, rules",
        )
        .eq("showroom_id", showroomId)
        .eq("is_current", true),
      db
        .from("sales_settings")
        .select("deposit_min_amount, deposit_min_pct, hold_days")
        .eq("showroom_id", showroomId)
        .maybeSingle(),
      db.from("discount_limits").select("role_id, max_pct").eq("showroom_id", showroomId),
      db.from("roles").select("id, key, is_owner").eq("showroom_id", showroomId),
      db.from("stock_levels").select("variant_id, warehouse_id, available").eq("showroom_id", showroomId),
      db.from("warehouses").select("id, is_default").eq("showroom_id", showroomId).eq("is_default", true),
    ],
  );

  const priceOf = new Map<string, number>();
  for (const p of prices.data ?? []) if (!priceOf.has(p.variant_id)) priceOf.set(p.variant_id, p.price);

  const catalog: PricingCatalog = { variants: {}, combos: {}, policies: [], available: {} };
  const products: LoadedCatalog["products"] = [];
  for (const v of variants.data ?? []) {
    const price = priceOf.get(v.id);
    if (price === undefined) continue;
    const name = v.name ? `${v.products.name} ${v.name}` : v.products.name;
    catalog.variants[v.id] = {
      id: v.id,
      name,
      categoryId: v.products.category_id ?? "",
      price,
      deliveryClass: v.products.delivery_class === "bulky" ? "bulky" : "parcel",
    };
    if (v.is_active && v.products.status === "active" && v.products.is_sellable && !v.products.deleted_at)
      products.push({ variantId: v.id, sku: v.sku, name, price });
  }
  products.sort((a, b) => a.sku.localeCompare(b.sku));

  const comboList: LoadedCatalog["combos"] = [];
  for (const c of combos.data ?? []) {
    if (c.combo_items.some((i) => !catalog.variants[i.variant_id])) continue;
    catalog.combos[c.id] = {
      id: c.id,
      name: c.name,
      pricingMode: c.pricing_mode === "fixed_price" ? "fixed_price" : "sum_minus",
      price: c.price ?? undefined,
      discount: c.discount ?? undefined,
      items: c.combo_items.map((i) => ({ variantId: i.variant_id, qty: i.qty, isGift: i.is_gift })),
      validFrom: c.valid_from ?? undefined,
      validTo: c.valid_to,
    };
    comboList.push({ id: c.id, code: c.code, name: c.name });
  }

  const rows = (policies.data ?? []) as PolicyRow[];
  catalog.policies = rows.map(toPricingPolicy).filter((p): p is Policy => p !== null);
  const notes = rows
    .filter((r) => ["payment", "warranty", "return"].includes(r.type) && r.status === "active")
    .map((r) => ({ type: r.type, name: r.name, text: String((r.rules as { text?: string })?.text ?? "") }));

  // Mặc định từ Cài đặt khi chưa có chính sách đang chạy cùng loại (hàm định giá tự lọc theo ngày, kênh).
  const s = settings.data;
  if (s && !catalog.policies.some((p) => p.type === "deposit" && p.status === "active")) {
    catalog.policies.push({
      id: "settings-deposit",
      version: 1,
      name: "Cọc theo Cài đặt, Bán hàng",
      status: "active",
      validFrom: "2000-01-01",
      validTo: null,
      channels: null,
      priority: -1,
      stackable: true,
      type: "deposit",
      rules: {
        minAmount: s.deposit_min_amount,
        minPercent: Number(s.deposit_min_pct),
        holdDays: s.hold_days,
      },
    });
  }
  if (!catalog.policies.some((p) => p.type === "discount_limit" && p.status === "active")) {
    // Vai trò không đặt giới hạn trong Cài đặt là không giới hạn (100%).
    const byRole: Record<string, number> = {};
    for (const r of roles.data ?? [])
      byRole[r.key] = r.is_owner ? 100 : Number(limits.data?.find((l) => l.role_id === r.id)?.max_pct ?? 100);
    catalog.policies.push({
      id: "settings-discount-limit",
      version: 1,
      name: "Giới hạn giảm theo Cài đặt, Bán hàng",
      status: "active",
      validFrom: "2000-01-01",
      validTo: null,
      channels: null,
      priority: -1,
      stackable: true,
      type: "discount_limit",
      rules: { byRole },
    });
  }

  const wh = warehouses.data?.[0]?.id;
  for (const l of levels.data ?? [])
    if (l.warehouse_id === wh) catalog.available![l.variant_id] = l.available ?? 0;
  for (const id of Object.keys(catalog.variants)) catalog.available![id] ??= 0;

  return { catalog, products, combos: comboList, notes };
}
