import type { Metadata } from "next";

import { ProductView } from "@/components/views/products-detail";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sản phẩm · Đại Việt CRM" };

export default async function Page({ params }: PageProps<"/products/[id]">) {
  const user = await requirePermission("product.view");
  const { id } = await params;
  return <ProductView user={user} id={id} />;
}
