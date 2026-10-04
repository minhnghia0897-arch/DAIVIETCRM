import type { Metadata } from "next";

import { CustomersView } from "@/components/views/customers";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Khách · Đại Việt CRM" };

export default async function Page({ searchParams }: PageProps<"/customers">) {
  const user = await requireUser();
  return <CustomersView user={user} searchParams={await searchParams} />;
}
