import { submitLandingLead } from "@/lib/landing/lead-server";

// Form của landing page gửi về đây. Trang chạy ở vùng cách ly (origin "null") nên phải mở CORS; chỉ nhận dữ liệu form,
// không trả gì về khách ngoài câu báo kết quả.

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request, ctx: RouteContext<"/api/lp/[slug]/lead">) {
  const { slug } = await ctx.params;
  const text = await req.text();
  if (text.length > 20_000)
    return Response.json({ ok: false, message: "Dữ liệu quá dài." }, { status: 413, headers: CORS });
  let raw: unknown;
  try {
    raw = (req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded")
      ? Object.fromEntries(new URLSearchParams(text))
      : JSON.parse(text);
  } catch {
    raw = null;
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const res = await submitLandingLead(slug, raw, ip);
  return Response.json(res.body, { status: res.status, headers: CORS });
}
