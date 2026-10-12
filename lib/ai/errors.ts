import { AI_PROVIDERS, type AiProviderId } from "./models";

// Lỗi gọi mô hình AI, dùng chung cho Claude (Anthropic) và ChatGPT (OpenAI). Câu lỗi không bao giờ chứa khóa API hay
// nội dung tin của khách.

export class AiError extends Error {
  /** Mã HTTP; -1 là không gọi được (mạng, quá giờ). */
  readonly status: number;
  /** Loại hoặc mã lỗi nhà cung cấp trả về (authentication_error, rate_limit_error, insufficient_quota…). */
  readonly type?: string;
  readonly provider: AiProviderId;
  constructor(status: number, type?: string, provider: AiProviderId = "anthropic") {
    super(`${AI_PROVIDERS[provider].vendor} API lỗi ${status}${type ? ` (${type})` : ""}`);
    this.status = status;
    this.type = type;
    this.provider = provider;
  }
}

// OpenAI báo hết tiền, chạm hạn mức chi tiêu bằng mã 429 kèm các mã này (docs/integrations/ai_llm.md); thử lại không
// giúp gì, khác với 429 vì gọi quá nhanh.
const OPENAI_BILLING = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
]);

/** Hết tiền hoặc chạm hạn mức chi tiêu của tài khoản nhà cung cấp. */
export function isBillingError(e: AiError): boolean {
  return (
    e.status === 402 || e.type === "billing_error" || (e.status === 429 && OPENAI_BILLING.has(e.type ?? ""))
  );
}

/** Lỗi tạm thời: thử lại một lần sau 2 giây. */
export function isRetryable(e: unknown): boolean {
  return (
    e instanceof AiError && !isBillingError(e) && (e.status === 429 || e.status >= 500 || e.status === -1)
  );
}

/** Lỗi do khóa, tài khoản, mô hình: dừng AI cả showroom (đấu nối sang Lỗi) và báo Owner. */
export function isFatalAiError(e: unknown): boolean {
  return e instanceof AiError && ([401, 403, 404].includes(e.status) || isBillingError(e));
}

/** Lỗi viết thành câu Owner hiểu, kèm cách xử lý (CLAUDE.md 11.2). */
export function aiErrorMessage(e: unknown): string {
  if (!(e instanceof AiError)) return "Trợ lý AI gặp lỗi không xác định. Thử lại sau ít phút.";
  const { vendor, console: site } = AI_PROVIDERS[e.provider];
  if (e.status === -1) return "Không gọi được máy chủ AI (mạng hoặc quá giờ chờ). Thử lại sau ít phút.";
  if (e.status === 401)
    return `API key của Trợ lý AI sai hoặc đã bị thu hồi. Owner tạo key mới ở ${site} rồi dán lại ở Cài đặt, Tích hợp.`;
  if (isBillingError(e))
    return `Tài khoản ${vendor} hết tiền, chạm hạn mức chi tiêu hoặc chưa có phương thức thanh toán. Owner nạp thêm hoặc nâng hạn mức ở ${site}.`;
  if (e.status === 403)
    return "API key không có quyền dùng mô hình đã chọn. Kiểm tra dự án, workspace của key hoặc chọn mô hình khác.";
  if (e.status === 404)
    return "Mô hình đã chọn không còn hoặc key không dùng được mô hình này. Chọn mô hình khác.";
  if (e.status === 429)
    return `${vendor} đang giới hạn lượt gọi. Đợi vài phút hoặc nâng giới hạn của tài khoản.`;
  if (e.status === 529 || e.status >= 500) return "Máy chủ AI đang quá tải. CRM tự thử lại ở tin sau.";
  return `Máy chủ AI từ chối yêu cầu (mã ${e.status}).`;
}
