import { OrderDemo } from "@/components/demo/pages/order";
import { ORDERS } from "@/lib/demo/data";

export const dynamicParams = false;
export function generateStaticParams() {
  return ORDERS.map((o) => ({ id: o.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <OrderDemo id={(await params).id} />;
}
