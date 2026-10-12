// Mô hình AI Owner chọn được và bảng giá (USD cho mỗi triệu token), theo
// https://platform.claude.com/docs/en/about-claude/pricing đọc ngày 12/10/2026. Giá đổi thì sửa ở đây
// (docs/integrations/ai_llm.md). Chi phí lưu bằng phần triệu đô la (số nguyên) và số đồng quy đổi theo tỷ giá Owner đặt.

export const AI_MODELS = [
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5 (cân bằng, khuyên dùng)",
    price: { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 },
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5 (nhanh, rẻ nhất)",
    // Giá cho lời nhắc tới 100.000 token; tin nhắn showroom luôn dưới ngưỡng này.
    price: { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 },
  },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5 (mạnh nhất, đắt nhất)",
    price: { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
  },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const DEFAULT_AI_MODEL: AiModelId = "claude-sonnet-5-5";

export function aiModel(id: string | null | undefined) {
  return AI_MODELS.find((m) => m.id === id) ?? AI_MODELS[0];
}

export interface AiUsage {
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
