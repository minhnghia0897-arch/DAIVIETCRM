// Gọi ChatGPT qua OpenAI Responses API bằng fetch, không thêm thư viện (CLAUDE.md mục 3). Điểm đã kiểm trên đặc tả
// OpenAPI chính thức: docs/integrations/ai_llm.md, phần ChatGPT. Khóa API chỉ đi trong header Authorization tới
// api.openai.com, không bao giờ nằm trong log hay câu lỗi.

import { AiError, isRetryable } from "./errors";

export const OPENAI_API = "https://api.openai.com";

/** Máy chạy thử trỏ sang máy chủ giả bằng OPENAI_BASE_URL (chỉ biến môi trường server). */
const apiBase = () =>
  (typeof process !== "undefined" ? process.env.OPENAI_BASE_URL : undefined) || OPENAI_API;

export interface ResponsesRequest {
  model: string;
  instructions: string;
  input: { role: "user"; content: string }[];
  /** Gồm cả token suy nghĩ của mô hình. */
  max_output_tokens: number;
  reasoning?: { effort: "low" | "medium" | "high" };
  text: { format: { type: "json_schema"; name: string; schema: unknown; strict: boolean } };
  /** Mặc định OpenAI lưu câu trả lời ít nhất 30 ngày; CRM không cần nên luôn tắt. */
  store: false;
  /** Gom các lượt cùng showroom để dùng lại bộ nhớ đệm phần đầu lời nhắc. */
  prompt_cache_key?: string;
}

export interface ResponsesResponse {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
  usage?: {
    input_tokens?: number;
    input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    output_tokens?: number;
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
        authorization: `Bearer ${apiKey}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs),
    });
  } catch {
    throw new AiError(-1, undefined, "openai");
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // Lỗi dạng { error: { message, type, param, code } }; mã (code) cụ thể hơn loại (type) nên ưu tiên.
    const err = (data as { error?: { type?: unknown; code?: unknown } } | null)?.error;
    const kind =
      typeof err?.code === "string" ? err.code : typeof err?.type === "string" ? err.type : undefined;
    throw new AiError(res.status, kind, "openai");
  }
  return data as T;
}

/** Một lượt hỏi mô hình. Gọi quá nhanh (429 không phải hết tiền), lỗi máy chủ thì thử lại một lần sau 2 giây. */
export async function createResponse(
  apiKey: string,
  req: ResponsesRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ResponsesResponse> {
  const send = () =>
    call<ResponsesResponse>(fetchImpl, apiKey, "/v1/responses", {
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

/** Kiểm khóa API và quyền dùng mô hình đã chọn mà không tốn token (GET /v1/models/{model}). */
export async function getOpenAiModel(apiKey: string, model: string, fetchImpl: typeof fetch = fetch) {
  return call<{ id?: string; owned_by?: string }>(
    fetchImpl,
    apiKey,
    `/v1/models/${encodeURIComponent(model)}`,
    {
      method: "GET",
      timeoutMs: 15_000,
    },
  );
}

/** Chữ JSON mô hình trả; null khi mô hình từ chối, hết chỗ viết hoặc không xong (JSON có thể dở dang). */
export function outputText(res: ResponsesResponse): string | null {
  if (res.status && res.status !== "completed") return null;
  const parts = (res.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  if (parts.some((p) => p.type === "refusal")) return null;
  const text = parts
    .filter((p) => p.type === "output_text")
    .map((p) => p.text ?? "")
    .join("");
  return text || null;
}
