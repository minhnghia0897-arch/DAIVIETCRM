import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import { loadCatalog } from "@/lib/sales/catalog-server";
import { POLICY_TYPE_LABEL, type PolicyType } from "@/lib/sales/policy-rules";
import { vnDay } from "@/lib/sales/pricing";

import { activeOnline, describePolicy, dmy, nextShiftText } from "./catalog-text";
import { vnd, type AiCatalog, type AiKnowledgeItem, type AiProduct, type AiTurn } from "./prompt";

// Nạp dữ liệu cho AI bằng service_role: kiến thức Owner viết, sản phẩm và giá niêm yết, ưu đãi và chính sách đang áp
// cho kênh online, ca kế tiếp, các tin gần đây của hội thoại. Không bao giờ nạp giá vốn, số điện thoại của khách.

type Db = SupabaseClient<Database>;

export interface AiData {
  knowledge: AiKnowledgeItem[];
  catalog: AiCatalog;
  nextShift: string | null;
}

export async function loadAiData(db: Db, showroomId: string, now: Date): Promise<AiData> {
  const [knowledge, loaded, details, categories, shifts] = await Promise.all([
    db
      .from("ai_knowledge")
      .select("title, body")
      .eq("showroom_id", showroomId)
      .eq("is_active", true)
      .order("sort")
      .order("created_at"),
    loadCatalog(db, showroomId, now),
    db
      .from("product_variants")
      .select(
        "id, products!inner(brand, description, warranty_months, requires_installation, is_gift_only, category_id)",
      )
      .eq("showroom_id", showroomId),
    db.from("product_categories").select("id, name").eq("showroom_id", showroomId),
    db.from("shifts").select("days, start_time").eq("showroom_id", showroomId).eq("is_active", true),
  ]);

  const catName = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const detail = new Map((details.data ?? []).map((d) => [d.id, d.products]));
  const { catalog, products, combos, notes } = loaded;

  const aiProducts: AiProduct[] = [];
  for (const p of products) {
    const d = detail.get(p.variantId);
    if (d?.is_gift_only) continue;
    aiProducts.push({
      sku: p.sku,
      name: p.name,
      price: p.price,
      category: d?.category_id ? (catName.get(d.category_id) ?? null) : null,
      brand: d?.brand ?? null,
      description: d?.description ?? null,
      warrantyMonths: d?.warranty_months ?? null,
      installation: d?.requires_installation ?? false,
      available: catalog.available?.[p.variantId] ?? null,
    });
  }

  const names = {
    variant: (id: string) => catalog.variants[id]?.name ?? "quà tặng",
    category: (id: string) => catName.get(id) ?? "sản phẩm",
    combo: (id: string) => catalog.combos[id]?.name ?? "combo",
  };
  const day = vnDay(now);
  const offers: string[] = [];
  for (const c of combos) {
    const cb = catalog.combos[c.id];
    if (!cb || (cb.validFrom && day < cb.validFrom) || (cb.validTo && day > cb.validTo)) continue;
    const items = cb.items
      .map((i) => `${i.qty > 1 ? `${i.qty} ` : ""}${names.variant(i.variantId)}${i.isGift ? " (tặng)" : ""}`)
      .join(" + ");
    const price =
      cb.pricingMode === "fixed_price" && cb.price !== undefined
        ? `giá trọn gói ${vnd(cb.price)}`
        : `giảm ${vnd(cb.discount ?? 0)} so với mua lẻ`;
    offers.push(`Combo "${cb.name}": ${items}; ${price}${cb.validTo ? ` (đến hết ${dmy(cb.validTo)})` : ""}`);
  }
  // Chính sách lấy từ Cài đặt, Bán hàng (id "settings-…") luôn áp; giới hạn giảm không có câu nào (nội bộ).
  for (const p of catalog.policies)
    if (p.id.startsWith("settings-") || activeOnline(p, day)) offers.push(...describePolicy(p, names));
  for (const n of notes)
    if (n.text) offers.push(`${POLICY_TYPE_LABEL[n.type as PolicyType] ?? n.type} "${n.name}": ${n.text}`);

  return {
    knowledge: knowledge.data ?? [],
    catalog: { products: aiProducts, offers },
    nextShift: nextShiftText(shifts.data ?? [], now),
  };
}

/** 30 tin gần nhất của hội thoại, cũ trước. Tin gửi lỗi không tính (khách không nhận được). */
export async function loadTurns(db: Db, conversationId: string): Promise<AiTurn[]> {
  const { data } = await db
    .from("messages")
    .select("direction, text, attachments, status, ai_run_id, occurred_at")
    .eq("conversation_id", conversationId)
    .neq("status", "failed")
    .order("occurred_at", { ascending: false })
    .limit(30);
  return (data ?? []).reverse().map((m) => ({
    who: m.direction === "in" ? "customer" : m.ai_run_id ? "ai" : "staff",
    text: m.text,
    files: Array.isArray(m.attachments) ? m.attachments.length : 0,
    at: new Date(m.occurred_at),
  }));
}
