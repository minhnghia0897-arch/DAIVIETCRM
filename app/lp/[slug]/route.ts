import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/admin";
import { isLandingSlug } from "@/lib/landing/contract";
import { loadLandingData } from "@/lib/landing/data-server";
import { injectLanding } from "@/lib/landing/inject";

// Landing page công khai (Marketing → Landing page): HTML tải lên (hoặc mẫu có sẵn) kèm dữ liệu CRM chèn ở máy chủ.
// Header CSP sandbox cho trang chạy ở vùng cách ly: mã trong HTML không đọc được cookie, phiên đăng nhập CRM của nhân
// viên mở trang. Trang đang tắt chỉ người có quyền xem marketing đang đăng nhập mới xem trước được.

export const dynamic = "force-dynamic";

const SANDBOX =
  "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox " +
  "allow-top-navigation-by-user-activation allow-modals";

const DEFAULT_TEMPLATE = "lib/landing/templates/khai-truong.html";

function notFound() {
  return new Response(
    '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,' +
      'initial-scale=1"><title>Không tìm thấy trang</title></head><body style="font-family:system-ui,sans-serif;' +
      'padding:48px 16px;text-align:center"><h1>Trang không tồn tại hoặc đã kết thúc</h1></body></html>',
    { status: 404, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } },
  );
}

export async function GET(_req: Request, ctx: RouteContext<"/lp/[slug]">) {
  const { slug } = await ctx.params;
  if (!isLandingSlug(slug)) return notFound();
  const admin = createAdminClient();
  const { data: page } = await admin
    .from("landing_pages")
    .select("slug, title, status, html, settings, showroom_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!page) return notFound();

  const published = page.status === "published";
  if (!published) {
    const user = await getSessionUser();
    if (!user || user.showroomId !== page.showroom_id || !user.permissions.has("marketing.view"))
      return notFound();
  }

  const html = page.html ?? (await readFile(join(process.cwd(), DEFAULT_TEMPLATE), "utf8"));
  const body = injectLanding(html, await loadLandingData(admin, page));
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": SANDBOX,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      // Trang đang chạy: CDN giữ 5 giây, không phục vụ bản cũ khi hết hạn, trình duyệt không giữ; ẩn hiện ghế, đổi giá,
      // ảnh có hiệu lực sau tối đa 5 giây mà lượt mở dồn dập (chạy quảng cáo) vẫn dùng chung bộ đệm.
      "cache-control": published ? "public, max-age=0, s-maxage=5" : "private, no-store",
      ...(published ? {} : { "x-robots-tag": "noindex" }),
    },
  });
}
