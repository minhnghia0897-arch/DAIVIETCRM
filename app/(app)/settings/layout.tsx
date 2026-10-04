import Link from "next/link";

import { requireUser } from "@/lib/auth/session";
import { visibleSettings } from "@/lib/nav";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const user = await requireUser();
  const items = visibleSettings(user.permissions);
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row">
      <nav aria-label="Cài đặt" className="md:w-52 md:shrink-0">
        <p className="mb-2 text-card-title font-bold">Cài đặt</p>
        <ul className="flex gap-1 overflow-x-auto md:flex-col">
          {items.map((i) => (
            <li key={i.href}>
              <Link
                href={i.href}
                className="block rounded-control px-3 py-2 whitespace-nowrap hover:bg-surface"
              >
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
