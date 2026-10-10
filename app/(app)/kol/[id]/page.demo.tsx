import { KocProfile } from "@/components/crm/koc/profile";
import { kocSeed } from "@/lib/koc/data";

export const dynamicParams = false;
// Bản demo tĩnh: thêm sẵn mã cho người mới thêm trong phiên (kc-9, kc-10…, lib/koc/actions.ts) để mở được hồ sơ.
export function generateStaticParams() {
  const seed = kocSeed().creators;
  const added = Array.from({ length: 20 }, (_, i) => `kc-${seed.length + 1 + i}`);
  return [...seed.map((c) => c.id), ...added].map((id) => ({ id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <KocProfile id={(await params).id} />;
}
