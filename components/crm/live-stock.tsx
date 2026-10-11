"use client";

import { PRODUCTS, VARIANTS } from "@/lib/demo/data";
import { available, levelOf } from "@/lib/sales/inventory";
import { useCrm } from "./store";

// Ô tồn đọc từ sổ kho đang chạy, để màn Sản phẩm khớp với Kho sau khi ghi sổ phiếu hay giữ hàng cho đơn.

export function StockCell({ variantId, warehouseId }: { variantId: string; warehouseId: string }) {
  const { state } = useCrm();
  const l = levelOf(state.stock, variantId, warehouseId);
  return (
    <>
      <b>{available(l)}</b>
      <span className="text-label text-text-weak"> / {l.onHand}</span>
    </>
  );
}

/** Tổng khả dụng của một sản phẩm, không tính hàng trưng bày. */
export function ProductAvailable({ productId }: { productId: string }) {
  const { state } = useCrm();
  const ids = new Set(VARIANTS.filter((v) => v.productId === productId).map((v) => v.id));
  const total = state.stock
    .filter((l) => ids.has(l.variantId) && l.warehouseId !== "wh-demo")
    .reduce((s, l) => s + available(l), 0);
  return <>{PRODUCTS.some((p) => p.id === productId) ? total : 0}</>;
}
