import type { Metadata } from "next";

import { KocBookings } from "@/components/crm/koc/bookings";

export const metadata: Metadata = { title: "Booking KOL, KOC · Đại Việt CRM" };

export default function Page() {
  return <KocBookings />;
}
