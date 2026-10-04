import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { visibleSettings } from "@/lib/nav";

export default async function SettingsIndex() {
  const user = await requireUser();
  const first = visibleSettings(user.permissions)[0];
  redirect(first ? first.href : "/forbidden");
}
