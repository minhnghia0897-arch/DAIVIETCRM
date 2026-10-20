import type { Metadata } from "next";
import { headers } from "next/headers";

import { LandingPagesView, type LandingPageRow } from "@/components/crm/views/landing-pages";
import { requireAnyPermission } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { siteUrl } from "@/lib/db/env";
import { createClient } from "@/lib/db/server";
import { readLandingSettings } from "@/lib/landing/contract";
import { loadLandingProducts } from "@/lib/landing/data-server";
import { leadStatsBySlug } from "@/lib/landing/stats";
import { MARKETING_VIEW } from "@/lib/nav";

import {
  removeLandingImage,
  saveLandingPage,
  saveLandingProduct,
  setLandingStatus,
  uploadLandingHtml,
  uploadLandingImage,
} from "./actions";

export const metadata: Metadata = { title: "Landing page · Đại Việt CRM" };

// Trang đọc qua RLS (marketing.view). Số lead và ghế, giá đọc bằng khóa máy chủ sau khi kiểm quyền: người làm
// marketing không có quyền xem lead hay sản phẩm vẫn thấy được số tổng hợp, không thấy tên, số khách.
export default async function Page() {
  const user = await requireAnyPermission(MARKETING_VIEW);
  const supabase = await createClient();
  const admin = createAdminClient();
  const [{ data: pages }, { data: custom }, { data: leads }, catalog, h] = await Promise.all([
    supabase
      .from("landing_pages")
      .select("id, slug, title, status, settings, html_updated_at")
      .order("created_at", { ascending: false }),
    supabase.from("landing_pages").select("id").not("html", "is", null),
    admin
      .from("leads")
      .select("created_at, source_detail")
      .eq("showroom_id", user.showroomId)
      .eq("source", "landing_page")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5000),
    loadLandingProducts(admin, user.showroomId),
    headers(),
  ]);

  const stats = leadStatsBySlug(leads ?? [], new Date());
  const customIds = new Set((custom ?? []).map((c) => c.id));
  const rows: LandingPageRow[] = (pages ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    status: p.status === "published" ? "published" : "draft",
    settings: readLandingSettings(p.settings),
    customHtml: customIds.has(p.id),
    htmlUpdatedAt: p.html_updated_at,
    leads7: stats.get(p.slug)?.week ?? 0,
    leadsTotal: stats.get(p.slug)?.total ?? 0,
    lastLeadAt: stats.get(p.slug)?.last ?? null,
  }));

  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host
    ? `${h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)/.test(host) ? "http" : "https")}://${host}`
    : siteUrl();

  return (
    <LandingPagesView
      pages={rows}
      products={catalog.products.map((p) => ({
        variantId: p.variantId,
        sku: p.sku,
        name: p.name,
        listPrice: p.listPrice,
        price: p.price,
        promotions: p.promotions,
        show: p.show,
        sort: p.sort,
        badge: p.badge ?? "",
        shortDesc: p.shortDesc ?? "",
        giftText: p.giftText ?? "",
        imageUrl: p.imageUrl,
      }))}
      gifts={catalog.gifts.map((g) => ({
        variantId: g.variantId,
        sku: g.sku,
        name: g.name,
        value: g.value,
        imageUrl: g.imageUrl,
      }))}
      origin={origin}
      canManage={user.permissions.has("marketing.manage") && !user.viewAs}
      actions={{
        savePage: saveLandingPage,
        setStatus: setLandingStatus,
        uploadHtml: uploadLandingHtml,
        uploadImage: uploadLandingImage,
        removeImage: removeLandingImage,
        saveProduct: saveLandingProduct,
      }}
    />
  );
}
