import type { Metadata } from "next";

import { TeamOverviewView } from "@/components/views/team-overview";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Đội ngũ · Đại Việt CRM" };

export default async function Page() {
  const user = await requireUser();
  return <TeamOverviewView user={user} />;
}
