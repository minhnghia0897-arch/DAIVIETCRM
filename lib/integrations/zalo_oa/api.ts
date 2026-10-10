import { z } from "zod";

// Gọi API Zalo OA (docs/integrations/zalo_oa.md). Không thêm thư viện. Token chỉ đi trong header tới máy chủ Zalo,
// không bao giờ nằm trong log hay thông báo lỗi.

export const ZALO_OAUTH = "https://oauth.zaloapp.com/v4/oa/access_token";
export const ZALO_API = "https://openapi.zalo.me";

/** Máy chạy thử trỏ sang máy chủ Zalo giả (chỉ biến môi trường server). */
const env = (name: string) => (typeof process !== "undefined" ? process.env[name] : undefined);
const oauthUrl = () => env("ZALO_OAUTH_URL") || ZALO_OAUTH;
const apiBase = () => env("ZALO_API_BASE") || ZALO_API;

export class ZaloError extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`Zalo API lỗi ${code}`);
    this.code = code;
  }
}

const envelope = z
  .object({ error: z.coerce.number().optional(), data: z.unknown().optional() })
  .passthrough();

async function req(fetchImpl: typeof fetch, input: URL | string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(input, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new ZaloError(-1);
  }
  const json: unknown = await res.json().catch(() => null);
  const e = envelope.safeParse(json);
  if (!res.ok && !(e.success && e.data.error)) throw new ZaloError(res.status);
  if (e.success && e.data.error && e.data.error !== 0) throw new ZaloError(e.data.error);
  return json;
}

const tokenBody = z.object({
  access_token: z.string().min(10),
  refresh_token: z.string().min(10),
  expires_in: z.coerce.number().positive(),
});

/** Đổi refresh token lấy access token mới. Zalo trả refresh token mới, refresh token cũ hết dùng được. */
export async function refreshOaToken(
  input: { appId: string; appSecret: string; refreshToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const json = await req(fetchImpl, oauthUrl(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", secret_key: input.appSecret },
    body: new URLSearchParams({
      refresh_token: input.refreshToken,
      app_id: input.appId,
      grant_type: "refresh_token",
    }).toString(),
  });
  const t = tokenBody.safeParse(json);
  if (!t.success) throw new ZaloError(-2);
  return {
    accessToken: t.data.access_token,
    refreshToken: t.data.refresh_token,
    expiresAt: new Date(Date.now() + t.data.expires_in * 1000),
  };
}

/** Gửi tin tư vấn (chữ) cho khách đã tương tác với OA. */
export async function sendCsText(
  input: { accessToken: string; userId: string; text: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ messageId: string }> {
  const json = (await req(fetchImpl, `${apiBase()}/v3.0/oa/message/cs`, {
    method: "POST",
    headers: { "content-type": "application/json", access_token: input.accessToken },
    body: JSON.stringify({ recipient: { user_id: input.userId }, message: { text: input.text } }),
  })) as { data?: { message_id?: string } };
  return { messageId: json.data?.message_id ?? "" };
}

/** OA mà access token thuộc về; dùng kiểm tra khi kết nối. */
export async function oaOfToken(accessToken: string, fetchImpl: typeof fetch = fetch) {
  const json = (await req(fetchImpl, `${apiBase()}/v2.0/oa/getoa`, {
    method: "GET",
    headers: { access_token: accessToken },
  })) as { data?: { oa_id?: string | number; name?: string } };
  return {
    oaId: json.data?.oa_id === undefined ? "" : String(json.data.oa_id),
    name: json.data?.name ?? null,
  };
}

/** Tên hiển thị của khách theo mã người dùng. Không lấy được thì trả null, không làm hỏng việc nhận tin. */
export async function zaloUserName(userId: string, accessToken: string, fetchImpl: typeof fetch = fetch) {
  try {
    const url = new URL(`${apiBase()}/v3.0/oa/user/detail`);
    url.searchParams.set("data", JSON.stringify({ user_id: userId }));
    const json = (await req(fetchImpl, url, { method: "GET", headers: { access_token: accessToken } })) as {
      data?: { display_name?: string };
    };
    return json.data?.display_name?.trim() || null;
  } catch {
    return null;
  }
}

/** Lỗi của Zalo viết thành câu người dùng hiểu, kèm cách xử lý (CLAUDE.md 11.2). */
export function zaloErrorMessage(e: unknown): string {
  if (!(e instanceof ZaloError)) return "Không gửi được tin. Thử lại sau ít phút.";
  if (e.code === -1) return "Không gọi được máy chủ Zalo. Kiểm tra mạng rồi thử lại.";
  if (e.code === -2) return "Zalo trả về dữ liệu token không đúng dạng. Thử kết nối lại.";
  if (e.code === -216 || e.code === -124 || e.code === -14014)
    return "Token Zalo OA hết hạn hoặc bị thu hồi. Owner lấy refresh token mới rồi kết nối lại ở Cài đặt, Tích hợp.";
  if (e.code === -213 || e.code === -230)
    return "Khách chưa quan tâm OA hoặc đã quá lâu không tương tác, Zalo không cho gửi tin tư vấn. Gọi điện cho khách.";
  if (e.code === -224 || e.code === -32)
    return "OA đã hết hạn mức gửi tin hoặc gửi quá nhanh. Kiểm tra gói OA hoặc đợi vài phút.";
  if (e.code === -201) return "Zalo báo dữ liệu gửi không hợp lệ. Kiểm tra nội dung tin rồi gửi lại.";
  return `Zalo từ chối tin (mã ${e.code}). Thử lại sau ít phút.`;
}
