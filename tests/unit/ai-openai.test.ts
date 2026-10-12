import { describe, expect, it, vi } from "vitest";

import { AiError, aiErrorMessage, isFatalAiError } from "@/lib/ai/errors";
import { aiCost, aiProvider } from "@/lib/ai/models";
import { createResponse, getOpenAiModel, outputText } from "@/lib/ai/openai";
import { DECISION_SCHEMA } from "@/lib/ai/prompt";
import { anthropicRequest, askModel, openaiAnswer, openaiRequest, type AiAsk } from "@/lib/ai/provider";
import { connectBlockers, initialState, quickFields, requiredSecrets } from "@/lib/integrations/connection";
import { getIntegration } from "@/lib/integrations/registry";

// Trợ lý AI chạy bằng ChatGPT (OpenAI Responses API), Owner chọn giữa Claude và ChatGPT theo mô hình (12/10/2026).

const ASK: AiAsk = {
  model: "gpt-6.1-sol",
  instructions: "LỜI DẶN",
  data: "DỮ LIỆU SHOWROOM",
  turn: "[Khách 10:00] Ghế giá bao nhiêu?",
  schema: DECISION_SCHEMA,
  cacheKey: "showroom-q4",
};

const decision = JSON.stringify({
  action: "reply",
  reply: "Dạ em là trợ lý tự động ạ",
  handoff_reason: "none",
  create_lead: false,
  summary: "Hỏi giá",
});

describe("chọn nhà cung cấp theo mô hình", () => {
  it("mô hình GPT dùng OpenAI và khóa OpenAI; Claude dùng Anthropic; mô hình lạ về Claude mặc định", () => {
    expect(aiProvider("gpt-6.1-sol")).toMatchObject({ id: "openai", secret: "ai_llm_openai_api_key" });
    expect(aiProvider("gpt-6-luna").id).toBe("openai");
    expect(aiProvider("claude-haiku-5-5")).toMatchObject({ id: "anthropic", secret: "ai_llm_api_key" });
    expect(aiProvider("không có").id).toBe("anthropic");
  });

  it("chỉ bắt dán khóa của nhà cung cấp đang chọn; ô mô hình hiện ở Kết nối nhanh", () => {
    const ai = getIntegration("ai_llm");
    expect(requiredSecrets(ai, { model: "gpt-6.1-sol" })).toEqual(["ai_llm_openai_api_key"]);
    expect(requiredSecrets(ai, { model: "claude-sonnet-5-5" })).toEqual(["ai_llm_api_key"]);
    expect(requiredSecrets(ai)).toEqual(["ai_llm_api_key"]);
    expect(quickFields(ai).map((f) => f.key)).toContain("model");
    const base = { ...initialState(ai), config: { model: "gpt-6.1-sol", monthlyBudget: "2000000" } };
    expect(connectBlockers(ai, { ...base, secrets: { ai_llm_api_key: "2026-10-12" } })).toEqual([
      "Chưa nhập API key OpenAI, khi dùng ChatGPT (platform.openai.com)",
    ]);
    expect(connectBlockers(ai, { ...base, secrets: { ai_llm_openai_api_key: "2026-10-12" } })).toEqual([]);
  });

  it("chi phí theo bảng giá GPT-6.1 Sol", () => {
    const c = aiCost(
      "gpt-6.1-sol",
      { input_tokens: 1000, output_tokens: 500, cache_write_tokens: 2000, cache_read_tokens: 10000 },
      26_500,
    );
    expect(c.usdMicros).toBe(2000 + 5000 + 5000 + 1000);
  });
});

describe("OpenAI Responses API", () => {
  it("gửi đúng đường, header, mẫu JSON nghiêm ngặt, không lưu câu trả lời; khóa không lọt vào câu lỗi", async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.openai.com/v1/responses");
      const h = init?.headers as Record<string, string>;
      expect(h.authorization).toBe("Bearer sk-bi-mat");
      expect(h["x-api-key"]).toBeUndefined();
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "gpt-6.1-sol",
        store: false,
        max_output_tokens: 2048,
        reasoning: { effort: "low" },
        prompt_cache_key: "showroom-q4",
        text: { format: { type: "json_schema", name: "ai_decision", strict: true } },
        input: [{ role: "user", content: ASK.turn }],
      });
      // Lời dặn rồi dữ liệu showroom đứng đầu lời nhắc để OpenAI giữ đệm.
      expect(body.instructions).toBe("LỜI DẶN\n\nDỮ LIỆU SHOWROOM");
      expect(body.text.format.schema).toEqual(DECISION_SCHEMA);
      return Response.json({
        status: "completed",
        output: [
          { type: "reasoning", content: [] },
          { type: "message", content: [{ type: "output_text", text: decision }] },
        ],
        usage: {
          input_tokens: 5000,
          input_tokens_details: { cached_tokens: 3000, cache_write_tokens: 1000 },
          output_tokens: 120,
          output_tokens_details: { reasoning_tokens: 40 },
        },
      });
    });
    const a = await askModel("sk-bi-mat", ASK, fetchImpl as typeof fetch);
    expect(a.text).toBe(decision);
    // Token đọc, ghi đệm tách khỏi token vào thường để tính đúng giá.
    expect(a.usage).toEqual({
      input_tokens: 1000,
      cache_read_tokens: 3000,
      cache_write_tokens: 1000,
      output_tokens: 120,
    });

    const denied = vi.fn(async () =>
      Response.json(
        {
          error: {
            message: "Incorrect API key provided",
            type: "invalid_request_error",
            code: "invalid_api_key",
          },
        },
        { status: 401 },
      ),
    );
    const err = await getOpenAiModel("sk-bi-mat", "gpt-6.1-sol", denied as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err).toMatchObject({ status: 401, provider: "openai", type: "invalid_api_key" });
    expect(String(err.message)).not.toContain("sk-bi-mat");
    expect(aiErrorMessage(err)).toContain("platform.openai.com");
    expect(isFatalAiError(err)).toBe(true);
  });

  it("từ chối, chưa xong, hết chỗ viết thì không đọc JSON", () => {
    expect(
      outputText({
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal", refusal: "x" }] }],
      }),
    ).toBeNull();
    expect(
      outputText({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [{ type: "message", content: [{ type: "output_text", text: "{" }] }],
      }),
    ).toBeNull();
    expect(openaiAnswer({ status: "completed", output: [] }).text).toBeNull();
  });

  it("gọi quá nhanh thì thử lại một lần; hết tiền thì không thử lại và dừng AI", async () => {
    let n = 0;
    const flaky = vi.fn(async () => {
      n++;
      return n === 1
        ? Response.json({ error: { type: "requests", code: "rate_limit_exceeded" } }, { status: 429 })
        : Response.json({ status: "completed", output: [] });
    });
    vi.useFakeTimers();
    const p = createResponse("k", openaiRequest(ASK), flaky as typeof fetch);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(p).resolves.toMatchObject({ status: "completed" });
    vi.useRealTimers();
    expect(n).toBe(2);

    let m = 0;
    const broke = vi.fn(async () => {
      m++;
      return Response.json(
        { error: { type: "insufficient_quota", code: "credit_balance_exhausted" } },
        { status: 429 },
      );
    });
    const err = await createResponse("k", openaiRequest(ASK), broke as typeof fetch).catch((e) => e);
    expect(m).toBe(1);
    expect(isFatalAiError(err)).toBe(true);
    expect(aiErrorMessage(err)).toContain("Tài khoản OpenAI hết tiền");
  });

  it("Claude vẫn gửi như cũ: dữ liệu showroom đánh dấu đệm", () => {
    const r = anthropicRequest({ ...ASK, model: "claude-sonnet-5-5" });
    expect(r.system[1]).toEqual({
      type: "text",
      text: "DỮ LIỆU SHOWROOM",
      cache_control: { type: "ephemeral" },
    });
    expect(r.output_config?.format?.type).toBe("json_schema");
  });
});
