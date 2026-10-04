import type { Metadata } from "next";

import { CustomerView } from "@/components/views/customers-detail";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Hồ sơ khách · Đại Việt CRM" };

export default async function Page({ params }: PageProps<"/customers/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  return <CustomerView user={user} id={id} />;
}
