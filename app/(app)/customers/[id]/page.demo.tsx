import { DemoDetail } from "@/components/demo/pages/detail";
import { CUSTOMERS } from "@/lib/demo/data";

export const dynamicParams = false;
export function generateStaticParams() {
  return CUSTOMERS.map((c) => ({ id: c.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DemoDetail kind="customer" id={(await params).id} />;
}
