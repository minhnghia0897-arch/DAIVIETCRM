import type { Metadata } from "next";

import { InventoryLive, type LiveInventory } from "@/components/crm/views/inventory-live";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";

import { cancelStockDocument, createStockDocument, postStockDocument, setLowThreshold } from "./actions";

export const metadata: Metadata = { title: "Kho · Đại Việt CRM" };

const time = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});

// Tồn kho thật: tồn chỉ đổi qua phiếu kho đã ghi sổ (sổ kho bất biến), giữ hàng do đơn đã cọc.
export default async function Page({ searchParams }: PageProps<"/inventory">) {
  const user = await requirePermission("inventory.view");
  const { tab } = await searchParams;
  const supabase = await createClient();
  const [warehouses, variants, levels, docs, moves, serials] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, name, is_display, is_virtual")
      .eq("is_active", true)
      .order("sort"),
    supabase
      .from("product_variants")
      .select("id, sku, name, products(name, track_serial)")
      .eq("is_active", true)
      .order("sku"),
    supabase
      .from("stock_levels")
      .select("variant_id, warehouse_id, on_hand, reserved, available, low_threshold"),
    supabase
      .from("stock_documents")
      .select(
        "id, code, kind, warehouse_id, to_warehouse_id, reason, status, created_by, created_at, stock_document_lines(variant_id, qty, counted, expected, serials)",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("stock_movements")
      .select("id, type, variant_id, warehouse_id, qty, reason, actor_id, at, document_id")
      .order("at", { ascending: false })
      .limit(300),
    supabase
      .from("serial_units")
      .select("serial, variant_id, warehouse_id, status, order_item_id")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const actorIds = [
    ...new Set(
      [...(docs.data ?? []).map((d) => d.created_by), ...(moves.data ?? []).map((m) => m.actor_id)].filter(
        (x): x is string => Boolean(x),
      ),
    ),
  ];
  const { data: people } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameOf = (id: string | null) => people?.find((p) => p.id === id)?.full_name ?? "Hệ thống";
  const docCode = new Map((docs.data ?? []).map((d) => [d.id, d.code]));

  const data: LiveInventory = {
    tab: typeof tab === "string" ? tab : "stock",
    warehouses: (warehouses.data ?? []).map((w) => ({ id: w.id, name: w.name, display: w.is_display })),
    variants: (variants.data ?? []).map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name ? `${v.products?.name} ${v.name}` : (v.products?.name ?? v.sku),
      trackSerial: Boolean(v.products?.track_serial),
    })),
    levels: (levels.data ?? []).map((l) => ({
      variantId: l.variant_id,
      warehouseId: l.warehouse_id,
      onHand: l.on_hand,
      reserved: l.reserved,
      available: l.available ?? l.on_hand - l.reserved,
      low: l.low_threshold,
    })),
    docs: (docs.data ?? []).map((d) => ({
      id: d.id,
      code: d.code,
      kind: d.kind,
      warehouseId: d.warehouse_id,
      toWarehouseId: d.to_warehouse_id,
      reason: d.reason,
      status: d.status,
      by: nameOf(d.created_by),
      at: time.format(new Date(d.created_at)),
      lines: d.stock_document_lines.map((l) => ({
        variantId: l.variant_id,
        qty: l.qty,
        counted: l.counted,
        expected: l.expected,
        serials: l.serials,
      })),
    })),
    moves: (moves.data ?? []).map((m) => ({
      id: m.id,
      type: m.type,
      variantId: m.variant_id,
      warehouseId: m.warehouse_id,
      qty: m.qty,
      ref: m.document_id ? (docCode.get(m.document_id) ?? "") : "",
      reason: m.reason,
      by: nameOf(m.actor_id),
      at: time.format(new Date(m.at)),
    })),
    serials: (serials.data ?? []).map((s) => ({
      serial: s.serial,
      variantId: s.variant_id,
      warehouseId: s.warehouse_id,
      status: s.status,
    })),
    perms: {
      document: user.permissions.has("inventory.document") && !user.viewAs,
      post: user.permissions.has("inventory.post") && !user.viewAs,
      threshold: user.permissions.has("product.manage") && !user.viewAs,
    },
  };

  return (
    <InventoryLive
      data={data}
      actions={{ createStockDocument, postStockDocument, cancelStockDocument, setLowThreshold }}
    />
  );
}
