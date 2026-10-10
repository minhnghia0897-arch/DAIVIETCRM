import { KocNav } from "@/components/crm/koc/nav";
import { KocProvider } from "@/components/crm/koc/provider";
import { requireAnyPermission } from "@/lib/auth/session";
import { KOC_VIEW } from "@/lib/koc/actions";

// Khu KOL, KOC: đang chạy bằng dữ liệu mô phỏng (lib/koc/data.ts), bảng database chờ duyệt.
export default async function KocLayout({ children }: LayoutProps<"/kol">) {
  await requireAnyPermission(KOC_VIEW);
  return (
    <KocProvider>
      <div className="mx-auto max-w-7xl space-y-4">
        <KocNav />
        {children}
      </div>
    </KocProvider>
  );
}
