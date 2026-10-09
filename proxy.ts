import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Làm mới phiên Supabase và chuyển người chưa đăng nhập về trang đăng nhập.
// Đây chỉ là kiểm tra lạc quan; quyền thật kiểm ở server component và ở database (RLS).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/invite") ||
    path.startsWith("/auth/") ||
    path.startsWith("/q/") ||
    // Webhook của nhà cung cấp gọi vào không có phiên đăng nhập; mỗi route tự kiểm chữ ký hoặc mã bí mật
    // (CLAUDE.md mục 10.1). Đẩy về /login sẽ làm mất tin.
    path.startsWith("/api/webhooks/") ||
    // Lịch chạy định kỳ (Vercel Cron) tự kiểm CRON_SECRET.
    path.startsWith("/api/cron/");
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
