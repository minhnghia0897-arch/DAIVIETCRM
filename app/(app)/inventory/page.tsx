import type { Metadata } from "next";

import { InventoryView } from "@/components/views/inventory";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Kho · Đại Việt CRM" };

export default async function Page({ searchParams }: PageProps<"/inventory">) {
  const user = await requirePermission("inventory.view");
  return <InventoryView user={user} searchParams={await searchParams} />;
}
