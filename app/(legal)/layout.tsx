import Link from "next/link";

// Trang công khai (không cần đăng nhập) mà Meta, Zalo đòi khi phát hành ứng dụng: chính sách quyền riêng tư, điều khoản,
// hướng dẫn xóa dữ liệu. Nội dung khớp cách CRM xử lý dữ liệu thật (CLAUDE.md mục 5, 10, 12).
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 justify-center bg-surface-2 px-4 py-10">
      <article className="c-legal w-full max-w-2xl rounded-card border border-line bg-surface px-6 py-8 shadow-card">
        {children}
        <nav
          aria-label="Trang pháp lý"
          className="mt-8 flex flex-wrap gap-4 border-t border-line pt-4 text-label"
        >
          <Link href="/privacy">Chính sách quyền riêng tư</Link>
          <Link href="/terms">Điều khoản sử dụng</Link>
          <Link href="/data-deletion">Yêu cầu xóa dữ liệu</Link>
        </nav>
      </article>
    </main>
  );
}
