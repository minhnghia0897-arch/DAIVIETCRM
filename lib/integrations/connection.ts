import type { IntegrationDefinition } from "./registry";

// Trạng thái và điều kiện kết nối của một đấu nối (CLAUDE.md 10.1, 10.2). Hàm thuần: dùng cho màn Cài đặt,
// Tích hợp và cho server khi kết nối thật. Giá trị bí mật không bao giờ nằm ở đây, chỉ có ngày cập nhật.

export type IntegrationStatus =
  "not_available" | "not_connected" | "connecting" | "connected" | "error" | "paused";

export interface IntegrationLog {
  at: string;
  type: string;
  status: "processed" | "failed" | "received";
  error?: string;
}

export interface IntegrationState {
  status: IntegrationStatus;
  config: Record<string, unknown>;
  /** Tên khóa → thời điểm cập nhật; không lưu giá trị. */
  secrets: Record<string, string>;
  connectedAt?: string;
  lastEventAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  lastErrorAt?: string;
  tokenExpiresAt?: string;
  log: IntegrationLog[];
}

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  not_available: "Sắp có",
  not_connected: "Chưa kết nối",
  connecting: "Đang kết nối",
  connected: "Đã kết nối",
  error: "Lỗi",
  paused: "Tạm dừng",
};

export function initialState(def: IntegrationDefinition): IntegrationState {
  return { status: def.connectMode ? "not_connected" : "not_available", config: {}, secrets: {}, log: [] };
}

/** Khóa phải có trước khi kết nối. Đấu nối OAuth tự nhận token khi đăng nhập, chỉ cần khóa ký webhook. */
export function requiredSecrets(def: IntegrationDefinition): string[] {
  if (def.connectMode === "oauth") return def.secrets.filter((s) => !/token/.test(s));
  return [...def.secrets];
}

export function configErrors(def: IntegrationDefinition, config: Record<string, unknown>): string[] {
  const r = def.configSchema.safeParse(config);
  if (r.success) return [];
  return r.error.issues.map((i) => {
    const field = def.configFields?.find((f) => f.key === String(i.path[0]));
    // Thông báo mặc định của zod là tiếng Anh; ô bỏ trống hoặc sai kiểu thì báo bằng lời người dùng hiểu.
    const value = config[String(i.path[0])];
    const empty = value === undefined || value === "";
    const message = i.code === "invalid_type" || empty ? "Chưa nhập" : i.message;
    return field ? `${field.label}: ${message}` : message;
  });
}

/** Lý do chưa bấm Kết nối được. Điều kiện tiên quyết chưa đánh dấu chỉ cảnh báo, không chặn (Owner tự xác nhận). */
export function connectBlockers(def: IntegrationDefinition, st: IntegrationState): string[] {
  if (!def.connectMode) return ["Đấu nối này chưa có trong phiên bản hiện tại"];
  const out: string[] = [];
  for (const s of requiredSecrets(def))
    if (!st.secrets[s]) out.push(`Chưa nhập ${def.secretLabels?.[s] ?? s}`);
  out.push(...configErrors(def, st.config));
  return out;
}

/** Phần còn thiếu viết gọn cho dòng tóm tắt: tên khóa bỏ phần giải thích, ô bỏ trống chỉ ghi tên ô. */
export function missingSummary(def: IntegrationDefinition, st: IntegrationState): string[] {
  if (!def.connectMode) return [];
  const out = requiredSecrets(def)
    .filter((s) => !st.secrets[s])
    .map((s) => (def.secretLabels?.[s] ?? s).replace(/\s*\(.*\)$/, ""));
  for (const e of configErrors(def, st.config)) out.push(e.replace(/: Chưa nhập$/, ""));
  return out;
}

export function prerequisiteWarnings(def: IntegrationDefinition, done: readonly string[]): string[] {
  return def.prerequisites.filter((p) => !done.includes(p.key)).map((p) => p.label);
}

/**
 * Lỗi dễ hiểu kèm cách xử lý khi nhà cung cấp từ chối (CLAUDE.md 11.2). Ở bản mô phỏng, điều kiện tiên quyết
 * chưa đánh dấu được coi là nguyên nhân lỗi tương ứng.
 */
export const PREREQ_ERRORS: Record<string, string> = {
  lead_access:
    "Không lấy được chi tiết lead vì ứng dụng chưa được cấp quyền trong phần quản lý quyền truy cập lead của Business Manager.",
  business_verified: "Meta chưa xác minh doanh nghiệp nên ứng dụng chưa được cấp quyền đọc lead.",
  meta_app: "Chưa có ứng dụng Meta đứng tên showroom.",
  oa_growth_plan: "Zalo từ chối API vì OA chưa ở gói Tăng trưởng trở lên. Nâng gói OA rồi kết nối lại.",
  oa_verified: "Zalo OA chưa được xác thực nên không cấp quyền API.",
  spf_dkim: "Máy chủ nhận đánh dấu thư là giả mạo vì tên miền chưa có bản ghi SPF, DKIM.",
  domain: "Chưa có tên miền để gửi thư.",
  pancake_api_scope: "Gói Pancake đang dùng không mở API.",
  provider_chosen: "Chưa chọn nhà cung cấp tổng đài.",
  messaging_permission: "Meta chưa duyệt quyền nhắn tin cho ứng dụng nên chưa nhận được tin của Page.",
  one_reply_place:
    "Page đang được trả lời ở công cụ khác. Đặt kênh đó chỉ đọc hoặc ngắt Page khỏi công cụ đó trước, mỗi kênh chỉ một nơi trả lời.",
  tiktok_ads_app: "TikTok từ chối đọc lead vì tài khoản quảng cáo chưa ủy quyền cho ứng dụng.",
  tiktok_messaging_access: "TikTok chưa cấp quyền Business Messaging API cho tài khoản này.",
  tiktok_vn_open: "TikTok chưa mở Business Messaging cho khu vực Việt Nam.",
  partner_center_app: "Chưa có ứng dụng trên TikTok Shop Partner Center.",
  shop_authorized: "Shop chưa ủy quyền cho ứng dụng nên không đọc được đơn.",
  zns_templates: "Zalo từ chối gửi vì mẫu tin ZNS chưa được duyệt.",
  zca_balance: "Tài khoản Zalo Cloud hết tiền, tin ZNS không gửi được. Nạp thêm rồi thử lại.",
  pixel: "Chưa có Pixel hoặc tập dữ liệu sự kiện trên Meta.",
  tiktok_pixel: "Chưa có TikTok Pixel để nhận sự kiện.",
  consent_text:
    "Chưa có căn cứ đồng ý gửi dữ liệu đo lường. Thêm câu xin đồng ý vào form và kịch bản gọi trước khi gửi.",
  company_account: "Tài khoản nhận tiền phải đứng tên pháp nhân của showroom.",
  legal_remittance: "Chưa xác nhận kênh nhận tiền từ nước ngoài hợp pháp.",
  einvoice_provider: "Chưa chọn nhà cung cấp hóa đơn điện tử.",
  legal_entity: "Chưa chốt pháp nhân xuất hóa đơn nên chưa đăng ký được mã số thuế với nhà cung cấp.",
  recordings: "Tổng đài chưa có ghi âm để chép lời.",
  ai_policy: "Chưa thống nhất việc AI được làm và người duyệt. Ghi rõ rồi mới bật trợ lý AI.",
};

export function healthCheck(
  def: IntegrationDefinition,
  st: IntegrationState,
  done: readonly string[],
): { ok: boolean; message: string } {
  const blockers = connectBlockers(def, st);
  if (blockers.length) return { ok: false, message: blockers[0] };
  const missing = def.prerequisites.find((p) => !done.includes(p.key));
  if (missing)
    return { ok: false, message: PREREQ_ERRORS[missing.key] ?? `Chưa đạt điều kiện: ${missing.label}` };
  return { ok: true, message: "Kết nối hoạt động" };
}

/** Các nút hiện theo trạng thái (CLAUDE.md 11.2). */
export function actionsFor(
  status: IntegrationStatus,
): ("connect" | "reconnect" | "test" | "pause" | "resume" | "disconnect")[] {
  switch (status) {
    case "not_available":
      return [];
    case "not_connected":
      return ["connect"];
    case "connecting":
      return [];
    case "connected":
      return ["test", "pause", "reconnect", "disconnect"];
    case "paused":
      return ["resume", "disconnect"];
    case "error":
      return ["reconnect", "disconnect"];
  }
}

/** Còn bao nhiêu ngày token hết hạn; cảnh báo khi dưới 3 ngày. */
export function tokenDaysLeft(st: IntegrationState, now: Date): number | null {
  if (!st.tokenExpiresAt) return null;
  return Math.floor((Date.parse(st.tokenExpiresAt) - now.getTime()) / 86_400_000);
}
