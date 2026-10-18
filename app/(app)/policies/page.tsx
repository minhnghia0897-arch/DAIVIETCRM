import type { Metadata } from "next";

import { PoliciesLive, type LivePolicy } from "@/components/crm/views/policies-live";
import { requireAnyPermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { PROVINCE_NAMES } from "@/lib/geo/provinces";
import { loadCatalog } from "@/lib/sales/catalog-server";

import { saveCombo, savePolicy, setPolicyStatus } from "./actions";

export const metadata: Metadata = { title: "Chính sách · Đại Việt CRM" };

// Chính sách, combo và Thử chính sách bản thật. Thử chính sách chạy đúng hàm định giá dùng chung trên dữ liệu thật.
export default async function Page() {
  const user = await requireAnyPermission(["policy.view", "product.view"]);
  const supabase = await createClient();
  const [policies, versions, combos, cats, roles, loaded] = await Promise.all([
    supabase
      .from("policies")
      .select(
        "id, policy_key, version, type, name, status, valid_from, valid_to, channels, priority, stackable, rules",
      )
      .eq("is_current", true)
      .order("type")
      .order("priority", { ascending: false }),
    supabase.from("policies").select("policy_key").eq("is_current", false),
    supabase
      .from("combos")
      .select(
        "id, code, name, description, pricing_mode, price, discount, valid_from, valid_to, status, combo_items(variant_id, qty, is_gift)",
      )
      .order("code"),
    supabase.from("product_categories").select("id, name").order("sort"),
    supabase.from("roles").select("key, name").order("name"),
    loadCatalog(createAdminClient(), user.showroomId),
  ]);
  const archived = new Map<string, number>();
  for (const v of versions.data ?? []) archived.set(v.policy_key, (archived.get(v.policy_key) ?? 0) + 1);

  const rows: LivePolicy[] = (policies.data ?? []).map((p) => ({
    id: p.id,
    policyKey: p.policy_key,
    version: p.version,
    oldVersions: archived.get(p.policy_key) ?? 0,
    type: p.type,
    name: p.name,
    status: p.status,
    validFrom: p.valid_from,
    validTo: p.valid_to,
    channels: p.channels ?? [],
    priority: p.priority,
    stackable: p.stackable,
    rules: p.rules,
  }));

  return (
    <PoliciesLive
      policies={rows}
      combos={(combos.data ?? []).map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        description: c.description ?? "",
        pricingMode: c.pricing_mode as "fixed_price" | "sum_minus",
        amount: (c.pricing_mode === "fixed_price" ? c.price : c.discount) ?? 0,
        validFrom: c.valid_from,
        validTo: c.valid_to,
        active: c.status === "active",
        items: c.combo_items.map((i) => ({ variantId: i.variant_id, qty: i.qty, isGift: i.is_gift })),
      }))}
      catalog={loaded.catalog}
      products={loaded.products}
      gifts={loaded.gifts}
      categories={cats.data ?? []}
      roles={(roles.data ?? []).map((r) => ({ key: r.key, name: r.name }))}
      provinces={PROVINCE_NAMES}
      showroomId={user.showroomId}
      perms={{
        policy: user.permissions.has("policy.manage") && !user.viewAs,
        combo: user.permissions.has("combo.manage") && !user.viewAs,
        viewPolicies: user.permissions.has("policy.view"),
      }}
      actions={{ savePolicy, setPolicyStatus, saveCombo }}
    />
  );
}
