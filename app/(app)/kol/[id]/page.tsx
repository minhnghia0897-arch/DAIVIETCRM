import type { Metadata } from "next";

import { KocProfile } from "@/components/crm/koc/profile";

export const metadata: Metadata = { title: "Hồ sơ KOL, KOC · Đại Việt CRM" };

export default async function Page({ params }: PageProps<"/kol/[id]">) {
  return <KocProfile id={(await params).id} />;
}
