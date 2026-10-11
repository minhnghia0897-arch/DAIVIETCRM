import type { Metadata } from "next";

import { KocPerformance } from "@/components/crm/koc/performance";

export const metadata: Metadata = { title: "Hiệu quả KOL, KOC · Đại Việt CRM" };

export default function Page() {
  return <KocPerformance />;
}
