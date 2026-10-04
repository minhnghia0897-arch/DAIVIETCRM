import type { Metadata } from "next";

import { StaffView } from "@/components/views/staff";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Hồ sơ nhân sự · Đại Việt CRM" };

export default async function Page() {
  const user = await requirePermission("staff.view");
  return <StaffView user={user} />;
}
