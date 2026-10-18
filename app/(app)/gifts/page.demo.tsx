"use client";

import { GiftsLive } from "@/components/crm/views/gifts-live";
import { DemoPage } from "@/components/demo/demo-user";
import { listProducts } from "@/lib/demo/repo";

// Bản demo: danh mục Quà tặng đọc từ dữ liệu mô phỏng, chỉ xem (thêm, sửa quà làm ở bản thật).
export default function Page() {
  return (
    <DemoPage anyOf={["product.view"]}>
      {(user) => (
        <GiftsLive
          rows={listProducts(user)
            .filter((p) => p.product.category === "Quà tặng kèm")
            .flatMap((p) =>
              p.variants.map((v) => ({
                id: v.id,
                sku: v.sku,
                name: p.product.name,
                description: p.product.description ?? null,
                value: v.price || null,
                warrantyMonths: p.product.warrantyMonths || null,
                active: p.product.status === "active",
              })),
            )}
          categoryId={null}
          perms={{ manage: false, price: false }}
          actions={{ saveProduct: async () => ({ ok: false, message: "Bản demo không lưu" }) }}
        />
      )}
    </DemoPage>
  );
}
