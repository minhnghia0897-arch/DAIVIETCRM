import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 items-start justify-center bg-linear-to-b from-band to-page to-[220px] px-4 pt-24">
      <section className="w-full max-w-md rounded-card border border-line bg-surface px-[14px] py-3 shadow-card">
        <h1 className="text-page-title font-bold">Đại Việt CRM</h1>
        <p className="mt-2 text-text-weak">
          Hệ thống đang được dựng. Đăng nhập và mời người dùng sẽ có ở tuần 1.
        </p>
        <div className="mt-4">
          <Button disabled>Đăng nhập</Button>
        </div>
      </section>
    </main>
  );
}
