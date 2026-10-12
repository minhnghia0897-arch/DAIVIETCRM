import type { Metadata } from "next";

import { CustomersLive, type CustomerRow } from "@/components/crm/views/customers-live";
import { requireAnyPermission } from "@/lib/auth/session";
import { LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/cdp/lifecycle";
import { createClient } from "@/lib/db/server";
import { CUSTOMER_VIEW } from "@/lib/nav";

export const metadata: Metadata = { title: "Khách · Đại Việt CRM" };

const LIMIT = 300;

// Danh sách khách (CLAUDE.md 1.1, 11.1). View customer_list đọc dưới phiên người dùng: RLS chỉ trả khách thuộc lead
// hoặc đơn người đó được xem. Giai đoạn vòng đời do database tính (refresh_customer_lifecycle), không sửa tay.
export default async function Page({ searchParams }: PageProps<"/customers">) {
  const user = await requireAnyPermission(CUSTOMER_VIEW);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const stage = (LIFECYCLE_STAGES as readonly string[]).includes(one("stage"))
    ? (one("stage") as LifecycleStage)
    : null;
  const market = /^([A-Z]{2}|unknown)$/.test(one("market")) ? one("market") : "";
  const q = one("q")
    .trim()
    .slice(0, 80)
    .replace(/[%_,()]/g, "");

  const supabase = await createClient();
  let query = supabase
    .from("customer_list")
    .select(
      "id, full_name, relation_in_household, country_of_residence, province, lifecycle_stage, last_interaction_at, owned_products, open_tasks, owner_name",
      { count: "exact" },
    );
  if (stage) query = query.eq("lifecycle_stage", stage);
  if (market) query = query.eq("country_of_residence", market);
  if (q) query = query.ilike("full_name", `%${q}%`);

  const count = (s: LifecycleStage) =>
    supabase
      .from("customer_list")
      .select("id", { count: "exact", head: true })
      .eq("lifecycle_stage", s)
      .then((r) => [s, r.count ?? 0] as const);

  const [list, markets, counts] = await Promise.all([
    query.order("last_interaction_at", { ascending: false }).limit(LIMIT),
    supabase.from("markets").select("country_code, name, color_token").eq("is_active", true).order("sort"),
    Promise.all(LIFECYCLE_STAGES.map(count)),
  ]);

  const rows: CustomerRow[] = (list.data ?? []).map((c) => ({
    id: c.id!,
    name: c.full_name ?? "Khách",
    relation: c.relation_in_household,
    market: c.country_of_residence ?? "unknown",
    province: c.province,
    stage: c.lifecycle_stage ?? "stranger",
    lastInteraction: c.last_interaction_at,
    owned: ownedNames(c.owned_products),
    openTasks: c.open_tasks ?? 0,
    ownerName: c.owner_name,
  }));

  return (
    <CustomersLive
      rows={rows}
      total={list.count ?? rows.length}
      counts={Object.fromEntries(counts) as Record<LifecycleStage, number>}
      markets={markets.data ?? []}
      filters={{ stage, market, q }}
      allCustomers={user.permissions.has("lead.view_all") || user.permissions.has("order.view_all")}
    />
  );
}

/** Tên sản phẩm đang dùng (customer_lifecycle.owned_products), gộp trùng. */
function ownedNames(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const names = v
    .map((x) => (x && typeof x === "object" && "name" in x ? String((x as { name: unknown }).name) : ""))
    .filter(Boolean);
  return [...new Set(names)];
}
