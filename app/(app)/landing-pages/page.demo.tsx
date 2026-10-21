"use client";

import { DemoPage } from "@/components/demo/demo-user";
import {
  LandingPagesView,
  type LandingGiftEdit,
  type LandingProductEdit,
} from "@/components/crm/views/landing-pages";
import { MARKETING_VIEW } from "@/lib/nav";

// Bản demo: thao tác chỉ báo kết quả, không lưu. Bản thật đăng trang ở /lp/<đường dẫn> và nhận lead từ form.
const demo = async () => ({ ok: true, message: "Bản mô phỏng: chưa lưu. Bản thật lưu vào database." });

const CHAIRS: [string, string, number][] = [
  ["DC108", "Ghế massage Daikiosan DC108", 15_900_000],
  ["DC117", "Ghế massage Daikiosan DC117", 18_900_000],
  ["DC112", "Ghế massage Daikiosan DC112", 26_900_000],
  ["DC202", "Ghế massage Daikiosan DC202", 29_900_000],
  ["DC201", "Ghế massage Daikiosan DC201", 32_900_000],
  ["DC203", "Ghế massage Daikiosan DC203", 39_900_000],
  ["DC302", "Ghế massage Daikiosan DC302", 49_900_000],
];

const PRODUCTS: LandingProductEdit[] = CHAIRS.map(([sku, name, price], i) => ({
  variantId: `demo-${sku}`,
  sku,
  name,
  listPrice: price,
  price,
  promotions: [],
  show: true,
  sort: i + 1,
  badge: sku === "DC201" ? "BÁN CHẠY" : "",
  shortDesc: "",
  giftText: "",
  imageUrl: null,
  gallery: [],
  detail: "",
  description: "",
}));

const GIFTS: LandingGiftEdit[] = [
  ["DM103", "Máy làm mát DM103"],
  ["DM110", "Máy làm mát DM110"],
  ["DQ120X", "Quạt điện DQ120X"],
  ["DB101", "Thiết bị nhà bếp DB101"],
].map(([sku, name]) => ({ variantId: `demo-${sku}`, sku, name, value: 0, imageUrl: null }));

export default function Page() {
  return (
    <DemoPage anyOf={MARKETING_VIEW}>
      {(user) => (
        <LandingPagesView
          pages={[
            {
              id: "lp-1",
              slug: "khai-truong-q4",
              title: "Khai trương Quận 4",
              status: "published",
              settings: {
                hotline: "0909 000 000",
                zalo: "",
                messenger: "",
                address: "Quận 4, TP.HCM",
                openHours: "8:30 – 21:00",
                kakao: "",
                mapUrl: "",
                logoUrl: "",
                bannerUrl: "",
                bannerMobileUrl: "",
                countdownEnd: "2026-10-31T23:59",
              },
              customHtml: false,
              htmlUpdatedAt: null,
              leads7: 12,
              leadsTotal: 18,
              lastLeadAt: "2026-10-20T03:15:00Z",
            },
          ]}
          products={PRODUCTS}
          gifts={GIFTS}
          origin="https://daivietcrmq4.vercel.app"
          canManage={user.permissions.has("marketing.manage")}
          actions={{
            savePage: demo,
            setStatus: demo,
            uploadHtml: demo,
            uploadImage: demo,
            removeImage: demo,
            saveProduct: demo,
          }}
        />
      )}
    </DemoPage>
  );
}
