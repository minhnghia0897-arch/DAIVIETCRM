import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import { loadCatalog } from "@/lib/sales/catalog-server";
import { priceQuote } from "@/lib/sales/pricing";

import {
  readLandingSettings,
  vnLocalToIso,
  type LandingData,
  type LandingGift,
  type LandingProduct,
} from "./contract";

// Dữ liệu CRM cho landing page: ghế bật "Hiện trên landing", giá từ bảng giá bán lẻ qua hàm định giá (khuyến mãi đang
// chạy ở kênh online áp như khi lên đơn, CLAUDE.md 8.1), quà trong danh mục Quà tặng, liên hệ của trang. Đọc bằng khóa
// máy chủ vì khách chưa đăng nhập; chỉ trả thông tin công khai (không giá vốn, không dữ liệu khách).

type Db = SupabaseClient<Database>;

export interface LandingProductRow extends LandingProduct {
  variantId: string;
  show: boolean;
  sort: number | null;
}

/** Mọi ghế bán được có giá, kèm cài đặt hiện trên landing; `onlyShown` lọc ghế đang bật. */
export async function loadLandingProducts(
  db: Db,
  showroomId: string,
  at = new Date(),
): Promise<{ products: LandingProductRow[]; gifts: LandingGift[] }> {
  const [{ catalog, products, gifts }, { data: rows }] = await Promise.all([
    loadCatalog(db, showroomId, at),
    db
      .from("product_variants")
      .select(
        "id, products!inner(short_desc, image_url, gift_text, landing_badge, landing_sort, show_on_landing)",
      )
      .eq("showroom_id", showroomId),
  ]);
  const extra = new Map((rows ?? []).map((r) => [r.id, r.products]));

  const list: LandingProductRow[] = products.map((p) => {
    const x = extra.get(p.variantId);
    const quote = priceQuote(
      {
        lines: [{ variantId: p.variantId, qty: 1 }],
        context: {
          showroomId,
          channel: "online",
          buyerCountry: "VN",
          customerTags: [],
          date: at,
          sellerId: "",
          sellerRole: "",
        },
      },
      catalog,
    );
    const line = quote.lines.find((l) => l.variantId === p.variantId && !l.isGift);
    return {
      variantId: p.variantId,
      sku: p.sku,
      name: p.name,
      shortDesc: x?.short_desc ?? null,
      imageUrl: x?.image_url ?? null,
      badge: x?.landing_badge ?? null,
      giftText: x?.gift_text ?? null,
      listPrice: p.price,
      price: line ? line.total : p.price,
      promoGifts: quote.lines.filter((l) => l.isGift).map((l) => l.name),
      promotions: quote.appliedPolicies.filter((a) => a.type === "promotion").map((a) => a.name),
      show: Boolean(x?.show_on_landing),
      sort: x?.landing_sort ?? null,
    };
  });
  list.sort((a, b) => (a.sort ?? 9999) - (b.sort ?? 9999) || a.listPrice - b.listPrice);

  const giftList: LandingGift[] = gifts.map((g) => ({
    sku: g.sku,
    name: g.name,
    value: g.value,
    imageUrl: extra.get(g.variantId)?.image_url ?? null,
  }));
  return { products: list, gifts: giftList };
}

export async function loadLandingData(
  db: Db,
  page: { slug: string; title: string; showroom_id: string; settings: unknown },
): Promise<LandingData> {
  const { products, gifts } = await loadLandingProducts(db, page.showroom_id);
  const s = readLandingSettings(page.settings);
  return {
    page: { slug: page.slug, title: page.title },
    products: products
      .filter((p) => p.show)
      .map((p) => ({
        sku: p.sku,
        name: p.name,
        shortDesc: p.shortDesc,
        imageUrl: p.imageUrl,
        badge: p.badge,
        giftText: p.giftText,
        listPrice: p.listPrice,
        price: p.price,
        promoGifts: p.promoGifts,
        promotions: p.promotions,
      })),
    gifts,
    contact: {
      hotline: s.hotline,
      zalo: s.zalo,
      address: s.address,
      openHours: s.openHours,
      kakao: s.kakao,
      mapUrl: s.mapUrl,
    },
    bannerUrl: s.bannerUrl,
    countdownEnd: vnLocalToIso(s.countdownEnd),
    leadUrl: `/api/lp/${page.slug}/lead`,
  };
}
