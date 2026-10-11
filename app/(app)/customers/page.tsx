import type { Metadata } from "next";

import { CustomersView } from "@/components/views/customers";
import { requireAnyPermission } from "@/lib/auth/session";
import { CUSTOMER_VIEW } from "@/lib/nav";

export const metadata: Metadata = { title: "Khách · Đại Việt CRM" };

export default async function Page({ searchParams }: PageProps<"/customers">) {
  const user = await requireAnyPermission(CUSTOMER_VIEW);
  return <CustomersView user={user} searchParams={await searchParams} />;
}
