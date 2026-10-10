export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-start justify-center bg-surface-2 px-4 pt-20">
      <div className="w-full max-w-sm">
        <p className="mb-4 text-center text-page-title font-bold text-brand-strong">Đại Việt</p>
        {children}
      </div>
    </main>
  );
}
