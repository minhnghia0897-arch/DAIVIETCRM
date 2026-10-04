import { DemoDetail } from "@/components/demo/pages/detail";
import { PRODUCTS } from "@/lib/demo/data";

export const dynamicParams = false;
export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ id: p.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DemoDetail kind="product" id={(await params).id} />;
}
