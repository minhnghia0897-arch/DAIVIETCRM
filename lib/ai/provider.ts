// Lớp chung cho mọi nhà cung cấp AI (CLAUDE.md 10.1, điều 6: đổi nhà cung cấp không ảnh hưởng nghiệp vụ). Nghiệp vụ
// (lời dặn, dữ liệu showroom, luật chuyển người, mẫu JSON) giống hệt nhau; chỉ cách gọi và cách đọc token khác nhau.
// Nhà cung cấp suy từ mô hình Owner chọn (lib/ai/models.ts).

import { createMessage, getModel, type MessageRequest, type MessageResponse } from "./anthropic";
import { aiProvider, type AiUsage } from "./models";
import {
  createResponse,
  getOpenAiModel,
  outputText,
  type ResponsesRequest,
  type ResponsesResponse,
} from "./openai";

export interface AiAsk {
  model: string;
  /** Lời dặn cố định (luật trả lời, chuyển người). */
  instructions: string;
  /** Dữ liệu showroom ít đổi (kiến thức, sản phẩm, giá, ưu đãi): để ngay sau lời dặn cho nhà cung cấp giữ đệm. */
  data: string;
  /** Lượt hiện tại: hội thoại gần nhất đã che số. */
  turn: string;
  schema: unknown;
  /** Gom các lượt cùng showroom để dùng lại bộ nhớ đệm (chỉ ChatGPT dùng). */
  cacheKey?: string;
}

export interface AiAnswer {
  /** Chữ JSON mô hình trả; null khi từ chối, hết chỗ viết hoặc không xong. */
  text: string | null;
  usage: AiUsage;
}

/** Gồm cả phần suy nghĩ của mô hình; tin trả lời tối đa khoảng 600 ký tự. */
const MAX_TOKENS = 2048;

export function anthropicRequest(a: AiAsk): MessageRequest {
  return {
    model: a.model,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: a.instructions },
      // Dữ liệu showroom ít đổi: đánh dấu để Anthropic giữ trong bộ nhớ đệm, các lượt sau rẻ hơn.
      { type: "text", text: a.data, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: a.turn }],
    output_config: { effort: "low", format: { type: "json_schema", schema: a.schema } },
  };
}

export function openaiRequest(a: AiAsk): ResponsesRequest {
  return {
    model: a.model,
    // OpenAI tự giữ đệm phần đầu lời nhắc giống nhau giữa các lượt: lời dặn và dữ liệu showroom đứng trước.
    instructions: `${a.instructions}\n\n${a.data}`,
    input: [{ role: "user", content: a.turn }],
    max_output_tokens: MAX_TOKENS,
    reasoning: { effort: "low" },
    text: { format: { type: "json_schema", name: "ai_decision", schema: a.schema, strict: true } },
    store: false,
    ...(a.cacheKey ? { prompt_cache_key: a.cacheKey } : {}),
  };
}

export function anthropicAnswer(res: MessageResponse): AiAnswer {
  const u = res.usage ?? {};
  // Mô hình từ chối hoặc hết chỗ viết thì JSON có thể dở dang: coi như không đọc được.
  const cut = res.stop_reason === "refusal" || res.stop_reason === "max_tokens";
  return {
    text: cut ? null : (res.content?.find((b) => b.type === "text")?.text ?? null),
    usage: {
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      cache_write_tokens: u.cache_creation_input_tokens ?? 0,
    },
  };
}

export function openaiAnswer(res: ResponsesResponse): AiAnswer {
  const u = res.usage ?? {};
  const read = u.input_tokens_details?.cached_tokens ?? 0;
  const write = u.input_tokens_details?.cache_write_tokens ?? 0;
  return {
    text: outputText(res),
    usage: {
      // OpenAI đếm token đọc, ghi bộ nhớ đệm bên trong input_tokens; tách ra để tính đúng giá từng phần.
      input_tokens: Math.max(0, (u.input_tokens ?? 0) - read - write),
      // output_tokens đã gồm token suy nghĩ (tính tiền như token ra).
      output_tokens: u.output_tokens ?? 0,
      cache_read_tokens: read,
      cache_write_tokens: write,
    },
  };
}

/** Hỏi mô hình một lượt bằng nhà cung cấp của mô hình đó. Lỗi ném AiError (lib/ai/errors.ts). */
export async function askModel(apiKey: string, a: AiAsk, fetchImpl: typeof fetch = fetch): Promise<AiAnswer> {
  return aiProvider(a.model).id === "openai"
    ? openaiAnswer(await createResponse(apiKey, openaiRequest(a), fetchImpl))
    : anthropicAnswer(await createMessage(apiKey, anthropicRequest(a), fetchImpl));
}

/** Kiểm khóa API dùng được mô hình đã chọn, không tốn token. */
export async function checkModel(
  apiKey: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (aiProvider(model).id === "openai") await getOpenAiModel(apiKey, model, fetchImpl);
  else await getModel(apiKey, model, fetchImpl);
}
