// Gọi Claude Messages API bằng fetch, không thêm thư viện (CLAUDE.md mục 3). Tài liệu đã kiểm: docs/integrations/
// ai_llm.md. Khóa API chỉ đi trong header tới api.anthropic.com, không bao giờ nằm trong log hay câu lỗi.

import { AiError, isRetryable } from "./errors";

export { AiError, aiErrorMessage } from "./errors";

export const ANTHROPIC_API = "https://api.anthropic.com";
const VERSION = "2023-06-01";

/** Máy chạy thử trỏ sang máy chủ giả bằng ANTHROPIC_BASE_URL (chỉ biến môi trường server). */
const apiBase = () =>
  (typeof process !== "undefined" ? process.env.ANTHROPIC_BASE_URL : undefined) || ANTHROPIC_API;

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
    throw new AiError(-1, undefined, "anthropic");
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const type = (data as { error?: { type?: unknown } } | null)?.error?.type;
    throw new AiError(res.status, typeof type === "string" ? type : undefined, "anthropic");
  }
  return data as T;
}

/** Một lượt hỏi mô hình. Quá tải (429, 529, 5xx) thì thử lại một lần sau 2 giây. */
export async function createMessage(
  apiKey: string,
  req: MessageRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<MessageResponse> {
  const send = () =>
    call<MessageResponse>(fetchImpl, apiKey, "/v1/messages", {
      method: "POST",
      body: req,
      timeoutMs: 45_000,
    });
  try {
    return await send();
  } catch (e) {
    if (!isRetryable(e)) throw e;
    await new Promise((r) => setTimeout(r, 2_000));
    return send();
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
