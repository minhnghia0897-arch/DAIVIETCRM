import type { Metadata } from "next";

import { CrmCustomer } from "@/components/crm/views/customer";
import { requireAnyPermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Hồ sơ khách · Đại Việt CRM" };

export default async function Page({ params }: PageProps<"/customers/[id]">) {
  await requireAnyPermission(["lead.view_own", "lead.view_all"]);
  const { id } = await params;
  return <CrmCustomer id={id} />;
}
