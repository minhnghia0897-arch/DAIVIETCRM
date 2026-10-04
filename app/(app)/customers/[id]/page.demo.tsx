import { CustomerDemo } from "@/components/demo/pages/customer";
import { CUSTOMERS } from "@/lib/demo/data";

export const dynamicParams = false;
export function generateStaticParams() {
  return CUSTOMERS.map((c) => ({ id: c.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <CustomerDemo id={(await params).id} />;
}
