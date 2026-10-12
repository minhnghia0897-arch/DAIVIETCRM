// Mô hình AI Owner chọn được và bảng giá (USD cho mỗi triệu token). Mỗi lúc chỉ một nhà cung cấp trả lời khách: nhà
// cung cấp suy từ mô hình Owner chọn (Owner chốt 12/10/2026, docs/integrations/ai_llm.md). Giá đổi thì sửa ở đây.
// - Claude: https://platform.claude.com/docs/en/about-claude/pricing, đọc ngày 12/10/2026.
// - ChatGPT: https://developers.openai.com/api/docs/pricing, đọc ngày 12/10/2026 qua công cụ tìm kiếm (môi trường làm
//   việc chặn tên miền OpenAI); mã mô hình đối chiếu với đặc tả OpenAPI chính thức (github.com/openai/openai-openapi).
// Chi phí lưu bằng phần triệu đô la (số nguyên) và số đồng quy đổi theo tỷ giá Owner đặt.

export type AiProviderId = "anthropic" | "openai";

export const AI_PROVIDERS: Record<
  AiProviderId,
  { label: string; vendor: string; console: string; secret: string; secretLabel: string }
> = {
  anthropic: {
    label: "Claude",
    vendor: "Anthropic",
    console: "console.anthropic.com",
    secret: "ai_llm_api_key",
    secretLabel: "API key Anthropic, khi dùng Claude (console.anthropic.com)",
  },
  openai: {
    label: "ChatGPT",
    vendor: "OpenAI",
    console: "platform.openai.com",
    secret: "ai_llm_openai_api_key",
    secretLabel: "API key OpenAI, khi dùng ChatGPT (platform.openai.com)",
  },
};

export const AI_MODELS = [
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5 (cân bằng, khuyên dùng)",
    price: { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 },
  },
  {
    id: "claude-haiku-5-5",
    provider: "anthropic",
    label: "Claude Haiku 5.5 (nhanh, rẻ nhất)",
    // Giá cho lời nhắc tới 100.000 token; tin nhắn showroom luôn dưới ngưỡng này.
    price: { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 },
  },
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    label: "Claude Opus 5.5 (mạnh nhất, đắt nhất)",
    price: { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
  },
  // Giá ChatGPT cho lời nhắc tới 272.000 token, mức xử lý thường (không Batch, Fast).
  {
    id: "gpt-6.1-sol",
    provider: "openai",
    label: "ChatGPT GPT-6.1 Sol (cân bằng, khuyên dùng khi dùng ChatGPT)",
    price: { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 },
  },
  {
    id: "gpt-6-luna",
    provider: "openai",
    label: "ChatGPT GPT-6 Luna (nhanh, rẻ nhất)",
    price: { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 },
  },
  {
    id: "gpt-6-astra",
    provider: "openai",
    label: "ChatGPT GPT-6 Astra (mạnh nhất, đắt nhất)",
    price: { input: 10, cacheWrite: 12.5, cacheRead: 1, output: 50 },
  },
] as const satisfies readonly {
  id: string;
  provider: AiProviderId;
  label: string;
  price: { input: number; cacheWrite: number; cacheRead: number; output: number };
}[];

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const AI_MODEL_IDS = AI_MODELS.map((m) => m.id) as [AiModelId, ...AiModelId[]];

export const DEFAULT_AI_MODEL: AiModelId = "claude-sonnet-5-5";

export function aiModel(id: string | null | undefined) {
  return AI_MODELS.find((m) => m.id === id) ?? AI_MODELS[0];
}

/** Nhà cung cấp của mô hình đang chọn, kèm tên khóa API trong kho bí mật. */
export function aiProvider(modelId: string | null | undefined) {
  const id = aiModel(modelId).provider;
  return { id, ...AI_PROVIDERS[id] };
}

/** Tên mô hình gọn cho câu báo (bỏ phần giải thích trong ngoặc). */
export const modelName = (modelId: string | null | undefined) =>
  aiModel(modelId).label.replace(/ \(.*\)$/, "");

export interface AiUsage {
  /** Token vào không lấy từ bộ nhớ đệm (không gồm phần đọc, ghi bộ nhớ đệm). */
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

/** Chi phí một lượt gọi: phần triệu đô la (làm tròn lên) và số đồng theo tỷ giá. */
export function aiCost(
  modelId: string | null | undefined,
  u: AiUsage,
  usdRate: number,
): { usdMicros: number; vnd: number } {
  const p = aiModel(modelId).price;
  // Giá theo USD / 1 triệu token, nên số token × giá chính là phần triệu đô la.
  const micros =
    u.input_tokens * p.input +
    u.cache_write_tokens * p.cacheWrite +
    u.cache_read_tokens * p.cacheRead +
    u.output_tokens * p.output;
  const usdMicros = Math.ceil(micros);
  const rate = Number.isFinite(usdRate) && usdRate > 0 ? usdRate : 0;
  return { usdMicros, vnd: Math.ceil((usdMicros * rate) / 1_000_000) };
}
