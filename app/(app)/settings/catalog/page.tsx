import type { Metadata } from "next";

import { CatalogLive, type CatalogRow } from "@/components/crm/views/settings-live";
import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { CATALOGS, type CatalogTable } from "@/lib/settings/config";

import { moveCatalogItem, saveCatalogItem } from "../config-actions";

export const metadata: Metadata = { title: "Danh mục · Đại Việt CRM" };

// Danh mục tra cứu thật (mục 6): nguồn lead, dịp tặng, kết quả cuộc gọi, lý do thất bại, ngân sách.
export default async function Page() {
  const user = await requireAnyPermission(["catalog.view", "catalog.manage"]);
  const supabase = await createClient();
  const tables = Object.keys(CATALOGS) as CatalogTable[];
  const results = await Promise.all(
    tables.map((t) =>
      supabase.from(t).select("id, key, label, sort, is_active").order("sort").order("label"),
    ),
  );
  const catalogs = Object.fromEntries(
    tables.map((t, i) => [
      t,
      (results[i].data ?? []).map((r): CatalogRow => ({
        id: r.id,
        key: r.key,
        label: r.label,
        sort: r.sort,
        isActive: r.is_active,
      })),
    ]),
  ) as Record<CatalogTable, CatalogRow[]>;
  return (
    <CatalogLive
      catalogs={catalogs}
      manage={user.permissions.has("catalog.manage") && !user.viewAs}
      actions={{ save: saveCatalogItem, move: moveCatalogItem }}
    />
  );
}
