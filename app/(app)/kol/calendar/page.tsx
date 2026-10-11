import type { Metadata } from "next";

import { KocCalendar } from "@/components/crm/koc/calendar";

export const metadata: Metadata = { title: "Lịch đăng KOL, KOC · Đại Việt CRM" };

export default function Page() {
  return <KocCalendar />;
}
