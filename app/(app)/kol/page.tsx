import type { Metadata } from "next";

import { KocList } from "@/components/crm/koc/list";

export const metadata: Metadata = { title: "KOL, KOC · Đại Việt CRM" };

export default function Page() {
  return <KocList />;
}
