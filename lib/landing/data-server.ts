import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import { MESSENGER_KEY } from "@/lib/integrations/meta_messenger/config";
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
  /** Ảnh chi tiết thêm (ngoài ảnh chính), thông tin chi tiết viết riêng cho landing: để sửa ở màn quản lý. */
  gallery: string[];
  landingDetail: string | null;
}

export interface LandingGiftRow extends LandingGift {
  variantId: string;
}

/** Mọi ghế bán được có giá, kèm cài đặt hiện trên landing; `onlyShown` lọc ghế đang bật. */
export async function loadLandingProducts(
  db: Db,
  showroomId: string,
  at = new Date(),
): Promise<{ products: LandingProductRow[]; gifts: LandingGiftRow[] }> {
  const [{ catalog, products, gifts }, { data: rows }] = await Promise.all([
    loadCatalog(db, showroomId, at),
    db
      .from("product_variants")
      .select(
        "id, products!inner(short_desc, image_url, gift_text, landing_badge, landing_sort, show_on_landing, gallery, landing_detail, description, warranty_months, compare_price)",
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
      comparePrice: x?.compare_price ?? null,
      promoGifts: quote.lines.filter((l) => l.isGift).map((l) => l.name),
      promotions: quote.appliedPolicies.filter((a) => a.type === "promotion").map((a) => a.name),
      show: Boolean(x?.show_on_landing),
      sort: x?.landing_sort ?? null,
      images: [x?.image_url, ...(x?.gallery ?? [])].filter((u): u is string => Boolean(u)).slice(0, 5),
      detail: x?.landing_detail || x?.description || null,
      warrantyMonths: x?.warranty_months ?? null,
      gallery: x?.gallery ?? [],
      landingDetail: x?.landing_detail ?? null,
    };
  });
  list.sort((a, b) => (a.sort ?? 9999) - (b.sort ?? 9999) || a.listPrice - b.listPrice);

  const giftList: LandingGiftRow[] = gifts.map((g) => ({
    variantId: g.variantId,
    sku: g.sku,
    name: g.name,
    value: g.value,
    imageUrl: extra.get(g.variantId)?.image_url ?? null,
  }));
  return { products: list, gifts: giftList };
}

/** Page ID của Page Facebook đã kết nối Messenger (chỉ đọc cấu hình công khai, không đọc khóa); rỗng khi chưa nối. */
async function connectedMessengerPage(db: Db, showroomId: string): Promise<string> {
  const { data } = await db
    .from("integrations")
    .select("config, status")
    .eq("showroom_id", showroomId)
    .eq("key", MESSENGER_KEY)
    .maybeSingle();
  const pageId = (data?.config as { pageId?: unknown } | null)?.pageId;
  return data?.status === "connected" && typeof pageId === "string" && /^\d{1,30}$/.test(pageId)
    ? pageId
    : "";
}

export async function loadLandingData(
  db: Db,
  page: { slug: string; title: string; showroom_id: string; settings: unknown },
): Promise<LandingData> {
  const s = readLandingSettings(page.settings);
  const [{ products, gifts }, messengerPage] = await Promise.all([
    loadLandingProducts(db, page.showroom_id),
    s.messenger ? Promise.resolve("") : connectedMessengerPage(db, page.showroom_id),
  ]);
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
        comparePrice: p.comparePrice,
        promoGifts: p.promoGifts,
        promotions: p.promotions,
        images: p.images,
        detail: p.detail,
        warrantyMonths: p.warrantyMonths,
      })),
    gifts: gifts.map((g) => ({ sku: g.sku, name: g.name, value: g.value, imageUrl: g.imageUrl })),
    contact: {
      hotline: s.hotline,
      zalo: s.zalo,
      messenger: s.messenger || messengerPage,
      address: s.address,
      openHours: s.openHours,
      kakao: s.kakao,
      mapUrl: s.mapUrl,
    },
    logoUrl: s.logoUrl,
    bannerUrl: s.bannerUrl,
    bannerMobileUrl: s.bannerMobileUrl,
    countdownEnd: vnLocalToIso(s.countdownEnd),
    leadUrl: `/api/lp/${page.slug}/lead`,
  };
}
