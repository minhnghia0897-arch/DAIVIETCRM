// Gọi Claude Messages API bằng fetch, không thêm thư viện (CLAUDE.md mục 3). Tài liệu đã kiểm: docs/integrations/
// ai_llm.md. Khóa API chỉ đi trong header tới api.anthropic.com, không bao giờ nằm trong log hay câu lỗi.

export const ANTHROPIC_API = "https://api.anthropic.com";
const VERSION = "2023-06-01";

/** Máy chạy thử trỏ sang máy chủ giả bằng ANTHROPIC_BASE_URL (chỉ biến môi trường server). */
const apiBase = () =>
  (typeof process !== "undefined" ? process.env.ANTHROPIC_BASE_URL : undefined) || ANTHROPIC_API;

export class AiError extends Error {
  /** Mã HTTP; -1 là không gọi được (mạng, quá giờ). */
  readonly status: number;
  /** Loại lỗi Anthropic trả về (authentication_error, rate_limit_error, overloaded_error…). */
  readonly type?: string;
  constructor(status: number, type?: string) {
    super(`Anthropic API lỗi ${status}${type ? ` (${type})` : ""}`);
    this.status = status;
    this.type = type;
  }
}

export interface MessageRequest {
  model: string;
  max_tokens: number;
  system: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[];
  messages: { role: "user" | "assistant"; content: string }[];
  output_config?: { effort?: "low" | "medium" | "high"; format?: { type: "json_schema"; schema: unknown } };
}

export interface MessageResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

async function call<T>(
  fetchImpl: typeof fetch,
  apiKey: string,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; timeoutMs: number },
): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(`${apiBase()}${path}`, {
      method: init.method,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": VERSION,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs),
    });
  } catch {
    throw new AiError(-1);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const type = (data as { error?: { type?: unknown } } | null)?.error?.type;
    throw new AiError(res.status, typeof type === "string" ? type : undefined);
  }
  return data as T;
}

/** Một lượt hỏi mô hình. Quá tải (429, 529, 5xx) thì thử lại một lần sau 2 giây. */
export async function createMessage(
  apiKey: string,
  req: MessageRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<MessageResponse> {
  try {
    return await call<MessageResponse>(fetchImpl, apiKey, "/v1/messages", {
      method: "POST",
      body: req,
      timeoutMs: 45_000,
    });
  } catch (e) {
    if (!(e instanceof AiError) || !(e.status === 429 || e.status >= 500 || e.status === -1)) throw e;
    await new Promise((r) => setTimeout(r, 2_000));
    return call<MessageResponse>(fetchImpl, apiKey, "/v1/messages", {
      method: "POST",
      body: req,
      timeoutMs: 45_000,
    });
  }
}

/** Kiểm khóa API và quyền dùng mô hình đã chọn mà không tốn token (GET /v1/models/{id}). */
export async function getModel(apiKey: string, model: string, fetchImpl: typeof fetch = fetch) {
  return call<{ id?: string; display_name?: string }>(
    fetchImpl,
    apiKey,
    `/v1/models/${encodeURIComponent(model)}`,
    { method: "GET", timeoutMs: 15_000 },
  );
}

/** Lỗi viết thành câu Owner hiểu, kèm cách xử lý (CLAUDE.md 11.2). */
export function aiErrorMessage(e: unknown): string {
  if (!(e instanceof AiError)) return "Trợ lý AI gặp lỗi không xác định. Thử lại sau ít phút.";
  if (e.status === -1) return "Không gọi được máy chủ AI (mạng hoặc quá giờ chờ). Thử lại sau ít phút.";
  if (e.status === 401)
    return "API key của Trợ lý AI sai hoặc đã bị thu hồi. Owner tạo key mới ở console.anthropic.com rồi dán lại ở Cài đặt, Tích hợp.";
  if (e.status === 402 || e.type === "billing_error")
    return "Tài khoản Anthropic hết tiền hoặc chưa có phương thức thanh toán. Owner nạp thêm ở console.anthropic.com.";
  if (e.status === 403)
    return "API key không có quyền dùng mô hình đã chọn. Kiểm tra workspace của key hoặc chọn mô hình khác.";
  if (e.status === 404)
    return "Mô hình đã chọn không còn hoặc key không dùng được mô hình này. Chọn mô hình khác.";
  if (e.status === 429)
    return "Anthropic đang giới hạn lượt gọi hoặc đã chạm hạn mức chi tiêu của tài khoản. Đợi vài phút hoặc nâng hạn mức.";
  if (e.status === 529 || e.status >= 500) return "Máy chủ AI đang quá tải. CRM tự thử lại ở tin sau.";
  return `Máy chủ AI từ chối yêu cầu (mã ${e.status}).`;
}
