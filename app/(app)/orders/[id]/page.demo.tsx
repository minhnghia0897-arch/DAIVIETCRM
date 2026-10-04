import { DemoDetail } from "@/components/demo/pages/detail";
import { ORDERS } from "@/lib/demo/data";

export const dynamicParams = false;
export function generateStaticParams() {
  return ORDERS.map((o) => ({ id: o.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DemoDetail kind="order" id={(await params).id} />;
}
