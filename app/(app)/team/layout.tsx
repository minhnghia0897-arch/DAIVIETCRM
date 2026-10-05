import { TeamNav } from "@/components/views/team-nav";
import { requireAnyPermission } from "@/lib/auth/session";
import { TEAM_VIEW } from "@/lib/nav";

export default async function TeamLayout({ children }: LayoutProps<"/team">) {
  const user = await requireAnyPermission(TEAM_VIEW);
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <TeamNav user={user} />
      {children}
    </div>
  );
}
