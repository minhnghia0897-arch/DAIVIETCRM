import { DemoDetail } from "@/components/demo/pages/detail";
import { STAFF } from "@/lib/demo/data";

export const dynamicParams = false;
export function generateStaticParams() {
  return STAFF.map((s) => ({ id: s.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DemoDetail kind="person" id={(await params).id} />;
}
