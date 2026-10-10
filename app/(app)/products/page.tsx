import type { Metadata } from "next";

import { ProductsView } from "@/components/views/products";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sản phẩm · Đại Việt CRM" };

export default async function Page({ searchParams }: PageProps<"/products">) {
  const user = await requirePermission("product.view");
  return <ProductsView user={user} searchParams={await searchParams} />;
}
