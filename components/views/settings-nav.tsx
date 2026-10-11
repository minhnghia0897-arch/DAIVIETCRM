import { SettingsMenu } from "@/components/settings-menu";
import type { SessionUser } from "@/lib/auth/types";
import { visibleSettings } from "@/lib/nav";

export function SettingsFrame({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const items = visibleSettings(user.permissions);
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row">
      <nav aria-label="Cài đặt" className="md:w-52 md:shrink-0">
        <h1 className="mb-2 px-3 text-page-title font-extrabold">Cài đặt</h1>
        <SettingsMenu items={items.map((i) => ({ href: i.href, label: i.label }))} />
      </nav>
      <div className="c-setbody min-w-0 flex-1">{children}</div>
    </div>
  );
}
