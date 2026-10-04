import { SettingsFrame } from "@/components/views/settings-nav";
import { requireUser } from "@/lib/auth/session";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const user = await requireUser();
  return <SettingsFrame user={user}>{children}</SettingsFrame>;
}
