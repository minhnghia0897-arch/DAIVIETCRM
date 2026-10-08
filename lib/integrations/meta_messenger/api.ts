import { z } from "zod";

// Gọi Graph API cho Messenger (docs/integrations/meta_messenger.md). Không thêm thư viện. Page access token chỉ đi
// trong yêu cầu tới graph.facebook.com, không bao giờ nằm trong log hay thông báo lỗi.

export const GRAPH = "https://graph.facebook.com/v25.0";

/** Máy chạy thử trỏ sang máy chủ Meta giả bằng META_GRAPH_BASE (chỉ biến môi trường server). */
const graphBase = () => (typeof process !== "undefined" ? process.env.META_GRAPH_BASE : undefined) || GRAPH;

export class GraphError extends Error {
  readonly code: number;
  readonly subcode?: number;
  constructor(code: number, subcode?: number) {
    super(`Graph API lỗi ${code}${subcode ? `/${subcode}` : ""}`);
    this.code = code;
    this.subcode = subcode;
  }
}

const errorBody = z.object({
  error: z.object({ code: z.number(), error_subcode: z.number().optional() }).passthrough(),
});

async function call<T>(
  fetchImpl: typeof fetch,
  path: string,
  token: string,
  init: { method?: "GET" | "POST"; query?: Record<string, string>; json?: unknown } = {},
): Promise<T> {
  const url = new URL(`${graphBase()}/${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: init.method ?? "GET",
      headers: init.json ? { "content-type": "application/json" } : undefined,
      body: init.json ? JSON.stringify(init.json) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Mạng lỗi hoặc quá 10 giây: mã -1 để báo "không gọi được Meta".
    throw new GraphError(-1);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = errorBody.safeParse(data);
    throw new GraphError(
      e.success ? e.data.error.code : res.status,
      e.success ? e.data.error.error_subcode : undefined,
    );
  }
  return data as T;
}

export interface SendInput {
  pageToken: string;
  psid: string;
  text: string;
  messagingType: "RESPONSE" | "MESSAGE_TAG";
  tag?: "HUMAN_AGENT" | null;
  /** Gắn mã tin của CRM để bản sao (echo) Meta gửi lại được nhận ra. */
  metadata: string;
}

export async function sendText(input: SendInput, fetchImpl: typeof fetch = fetch): Promise<{ mid: string }> {
  const r = await call<{ message_id?: string }>(fetchImpl, "me/messages", input.pageToken, {
    method: "POST",
    json: {
      recipient: { id: input.psid },
      messaging_type: input.messagingType,
      ...(input.tag ? { tag: input.tag } : {}),
      message: { text: input.text, metadata: input.metadata },
    },
  });
  return { mid: r.message_id ?? "" };
}

/** Page mà token thuộc về; dùng kiểm tra khi kết nối. */
export async function pageOfToken(pageToken: string, fetchImpl: typeof fetch = fetch) {
  return call<{ id: string; name?: string }>(fetchImpl, "me", pageToken, { query: { fields: "id,name" } });
}

/** Đăng ký ứng dụng nhận webhook của Page với các trường tin nhắn. */
export async function subscribePage(pageId: string, pageToken: string, fetchImpl: typeof fetch = fetch) {
  return call<{ success?: boolean }>(fetchImpl, `${pageId}/subscribed_apps`, pageToken, {
    method: "POST",
    query: { subscribed_fields: "messages,messaging_postbacks,message_echoes" },
  });
}

/** Tên khách theo PSID. Meta có thể không trả (khách giới hạn quyền riêng tư): trả null, không làm hỏng việc nhận tin. */
export async function userName(psid: string, pageToken: string, fetchImpl: typeof fetch = fetch) {
  try {
    const r = await call<{ first_name?: string; last_name?: string; name?: string }>(
      fetchImpl,
      psid,
      pageToken,
      {
        query: { fields: "first_name,last_name,name" },
      },
    );
    const name = r.name ?? [r.last_name, r.first_name].filter(Boolean).join(" ");
    return name.trim() || null;
  } catch {
    return null;
  }
}

/** Lỗi của Meta viết thành câu người dùng hiểu, kèm cách xử lý (CLAUDE.md 11.2). */
export function graphErrorMessage(e: unknown): string {
  if (!(e instanceof GraphError)) return "Không gửi được tin. Thử lại sau ít phút.";
  if (e.code === -1) return "Không gọi được máy chủ Meta. Kiểm tra mạng rồi thử lại.";
  if (e.code === 190)
    return "Page access token hết hạn hoặc bị thu hồi. Owner lấy token mới rồi kết nối lại ở Cài đặt, Tích hợp.";
  if (e.code === 10 && e.subcode === 2018278)
    return "Đã quá khung 24 giờ sau tin cuối của khách nên Meta không cho gửi tin này.";
  if (e.code === 10 || e.code === 200 || e.code === 230)
    return "Ứng dụng Meta chưa được cấp quyền nhắn tin cho Page này (pages_messaging), hoặc thẻ Human Agent chưa được duyệt.";
  if (e.code === 551) return "Khách hiện không nhận được tin (đã chặn Page hoặc tạm khóa tài khoản).";
  if (e.code === 100) return "Meta không nhận ra người nhận này trên Page. Kiểm tra lại Page đang kết nối.";
  if (e.code === 4 || e.code === 32 || e.code === 613)
    return "Page đang gửi quá nhanh, Meta tạm chặn. Đợi vài phút rồi gửi lại.";
  return `Meta từ chối tin (mã ${e.code}). Thử lại sau ít phút.`;
}
