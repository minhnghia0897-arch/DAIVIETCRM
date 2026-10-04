import { OrderDemo } from "@/components/demo/pages/order";
import { NEW_ORDER_IDS, ORDERS } from "@/lib/demo/data";

export const dynamicParams = false;
export function generateStaticParams() {
  // Kèm mã dự phòng cho đơn sinh từ báo giá trong phiên mô phỏng.
  return [...ORDERS.map((o) => o.id), ...NEW_ORDER_IDS].map((id) => ({ id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <OrderDemo id={(await params).id} />;
}
