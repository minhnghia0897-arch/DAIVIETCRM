import { z } from "zod";

// Sổ đăng ký đấu nối (CLAUDE.md mục 10.2, 10.3). Trang Cài đặt, Tích hợp đọc từ đây.
// Đấu nối chưa làm vẫn khai báo với `implemented: false` để hiện "Sắp có" kèm điều kiện tiên quyết.

export type IntegrationGroup = "channels" | "calls" | "ads_measurement" | "finance" | "operations" | "ai";

export type Capability =
  | "inbound_leads"
  | "inbound_messages"
  | "outbound_messages"
  | "inbound_calls"
  | "outbound_calls"
  | "inbound_orders"
  | "inbound_payments"
  | "outbound_events"
  | "outbound_invoices"
  | "file_storage"
  | "email"
  | "ai_processing";

export type IntegrationPhase = "month_1" | "month_2" | "month_3" | "when_available" | "optional";

export interface Prerequisite {
  key: string;
  label: string;
  helpUrl?: string;
}

export type ConnectMode = "oauth" | "api_key";

/** Ô cấu hình không bí mật hiện trên tab Cấu hình; giá trị kiểm bằng `configSchema`. */
export interface ConfigField {
  key: string;
  label: string;
  kind: "text" | "list" | "mapping" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface IntegrationDefinition {
  key: string;
  name: string;
  description: string;
  group: IntegrationGroup;
  phase: IntegrationPhase;
  implemented: boolean;
  capabilities: Capability[];
  prerequisites: Prerequisite[];
  configSchema: z.ZodType;
  secrets: string[];
  supportsReplyMode?: boolean;
  /** Có khi màn Cài đặt đã cho kết nối (OAuth hoặc nhập khóa); không có thì hiện "Sắp có". */
  connectMode?: ConnectMode;
  configFields?: readonly ConfigField[];
  /** Nhãn tiếng Việt cho từng khóa bí mật. */
  secretLabels?: Readonly<Record<string, string>>;
}

/** Trường lead mà câu hỏi của form quảng cáo được ánh xạ sang (CLAUDE.md 10.4). */
export const LEAD_FIELDS = [
  { value: "full_name", label: "Họ tên" },
  { value: "phone", label: "Số điện thoại" },
  { value: "country_of_residence", label: "Quốc gia đang sống" },
  { value: "recipient_province", label: "Tỉnh người nhận" },
  { value: "product_interest", label: "Sản phẩm quan tâm" },
  { value: "occasion", label: "Dịp tặng" },
] as const;

const noConfig = z.object({});

export const integrations = [
  {
    key: "meta_lead_ads",
    name: "Form quảng cáo Facebook",
    description: "Nhận lead từ form quảng cáo Facebook ngay khi khách gửi.",
    group: "channels",
    phase: "month_1",
    implemented: false,
    capabilities: ["inbound_leads"],
    prerequisites: [
      { key: "meta_app", label: "Đã tạo ứng dụng Meta đứng tên showroom" },
      { key: "business_verified", label: "Đã xác minh doanh nghiệp trên Meta" },
      { key: "lead_access", label: "Đã cấp quyền truy cập lead cho ứng dụng CRM trong Business Manager" },
    ],
    configSchema: z.object({
      pageId: z.string().regex(/^\d{5,20}$/, "ID Page là dãy số"),
      formIds: z.array(z.string().regex(/^\d{5,20}$/, "ID form là dãy số")).min(1, "Chọn ít nhất một form"),
      fieldMapping: z.record(z.string(), z.string()).default({}),
    }),
    secrets: ["meta_app_secret", "meta_page_access_token"],
    connectMode: "oauth",
    configFields: [
      { key: "pageId", label: "ID Page Facebook", kind: "text", placeholder: "Ví dụ 104857300000001" },
      { key: "formIds", label: "ID các form cần nhận", kind: "list", placeholder: "Mỗi dòng một ID form" },
      { key: "fieldMapping", label: "Ánh xạ câu hỏi của form sang trường lead", kind: "mapping" },
    ],
    secretLabels: {
      meta_app_secret: "App Secret của ứng dụng Meta (kiểm chữ ký webhook)",
      meta_page_access_token: "Page access token (lấy qua đăng nhập Facebook)",
    },
  },
  {
    key: "zalo_oa",
    name: "Zalo OA",
    description: "Nhận và trả lời tin nhắn Zalo OA ngay trên hồ sơ khách.",
    group: "channels",
    phase: "month_1",
    implemented: false,
    capabilities: ["inbound_messages", "outbound_messages", "inbound_leads"],
    prerequisites: [
      { key: "oa_verified", label: "Zalo OA đã xác thực" },
      { key: "oa_growth_plan", label: "Đã nâng Zalo OA lên gói Tăng trưởng trở lên" },
    ],
    configSchema: z.object({ oaId: z.string().regex(/^\d{5,25}$/, "ID OA là dãy số") }),
    secrets: ["zalo_app_secret", "zalo_refresh_token"],
    connectMode: "oauth",
    configFields: [
      { key: "oaId", label: "ID Zalo OA", kind: "text", placeholder: "Ví dụ 4318000000000000000" },
    ],
    secretLabels: {
      zalo_app_secret: "Secret key của ứng dụng Zalo (kiểm chữ ký webhook)",
      zalo_refresh_token: "Refresh token OA (lấy qua đăng nhập Zalo OA)",
    },
    supportsReplyMode: true,
  },
  {
    key: "email_smtp",
    name: "Email gửi lời mời",
    description: "Gửi lời mời và đặt lại mật khẩu từ tên miền của showroom.",
    group: "operations",
    phase: "month_1",
    implemented: false,
    capabilities: ["email"],
    prerequisites: [
      { key: "domain", label: "Đã chốt tên miền của showroom" },
      { key: "spf_dkim", label: "Tên miền đã có bản ghi SPF và DKIM" },
    ],
    configSchema: z.object({
      host: z.string().min(3, "Nhập máy chủ SMTP"),
      port: z.string().regex(/^\d{2,5}$/, "Cổng là số, thường 465 hoặc 587"),
      username: z.string().min(1, "Nhập tên đăng nhập SMTP"),
      fromAddress: z.email("Địa chỉ gửi chưa đúng dạng email"),
    }),
    secrets: ["smtp_password"],
    connectMode: "api_key",
    configFields: [
      { key: "host", label: "Máy chủ SMTP", kind: "text", placeholder: "smtp.example.com" },
      { key: "port", label: "Cổng", kind: "text", placeholder: "587" },
      { key: "username", label: "Tên đăng nhập", kind: "text" },
      {
        key: "fromAddress",
        label: "Địa chỉ gửi",
        kind: "text",
        placeholder: "no-reply@daivietshowroomq4.vn",
      },
    ],
    secretLabels: { smtp_password: "Mật khẩu SMTP" },
  },
  {
    key: "call_provider",
    name: "Tổng đài",
    description: "Gọi đi, nhận cuộc gọi đến và lưu ghi âm qua tổng đài.",
    group: "calls",
    phase: "when_available",
    implemented: false,
    capabilities: ["inbound_calls", "outbound_calls"],
    prerequisites: [{ key: "provider_chosen", label: "Đã chọn nhà cung cấp tổng đài" }],
    configSchema: z.object({
      adapter: z.enum(["mock"], "Hiện chỉ có tổng đài giả lập để kiểm thử"),
      webhookPath: z.string().default("/api/webhooks/call/mock"),
    }),
    secrets: ["call_provider_api_key"],
    connectMode: "api_key",
    configFields: [
      {
        key: "adapter",
        label: "Nhà cung cấp",
        kind: "select",
        options: [{ value: "mock", label: "Tổng đài giả lập (kiểm thử)" }],
      },
    ],
    secretLabels: { call_provider_api_key: "API key tổng đài" },
  },
  {
    key: "pancake",
    name: "Pancake",
    description: "Đọc hội thoại từ Pancake cho kênh đội đang trả lời ở Pancake.",
    group: "channels",
    phase: "optional",
    implemented: false,
    capabilities: ["inbound_messages"],
    prerequisites: [{ key: "pancake_api_scope", label: "Đã kiểm tra gói Pancake có mở API" }],
    configSchema: z.object({ pageIds: z.array(z.string().min(1)).min(1, "Nhập ít nhất một trang Pancake") }),
    secrets: ["pancake_api_key"],
    connectMode: "api_key",
    configFields: [
      { key: "pageIds", label: "ID các trang trên Pancake", kind: "list", placeholder: "Mỗi dòng một ID" },
    ],
    secretLabels: { pancake_api_key: "API key Pancake" },
    supportsReplyMode: true,
  },
  {
    key: "meta_messenger",
    name: "Tin nhắn Facebook",
    description: "Nhận và trả lời tin nhắn Facebook trong 24 giờ sau tin cuối của khách.",
    group: "channels",
    phase: "month_2",
    implemented: false,
    capabilities: ["inbound_messages", "outbound_messages"],
    prerequisites: [{ key: "messaging_permission", label: "Ứng dụng Meta đã được duyệt quyền nhắn tin" }],
    configSchema: noConfig,
    secrets: [],
    supportsReplyMode: true,
  },
  {
    key: "tiktok_lead_forms",
    name: "Form quảng cáo TikTok",
    description: "Nhận lead từ form quảng cáo TikTok.",
    group: "channels",
    phase: "month_2",
    implemented: false,
    capabilities: ["inbound_leads"],
    prerequisites: [{ key: "tiktok_ads_app", label: "Tài khoản quảng cáo đã ủy quyền cho ứng dụng" }],
    configSchema: noConfig,
    secrets: [],
  },
  {
    key: "tiktok_messaging",
    name: "Tin nhắn TikTok",
    description: "Nhận và trả lời tin nhắn TikTok khi được TikTok cấp quyền.",
    group: "channels",
    phase: "when_available",
    implemented: false,
    capabilities: ["inbound_messages", "outbound_messages"],
    prerequisites: [{ key: "tiktok_messaging_access", label: "Đã được cấp quyền Business Messaging API" }],
    configSchema: noConfig,
    secrets: [],
    supportsReplyMode: true,
  },
  {
    key: "tiktok_shop",
    name: "TikTok Shop",
    description: "Đưa đơn TikTok Shop về cùng danh sách đơn hàng.",
    group: "channels",
    phase: "month_3",
    implemented: false,
    capabilities: ["inbound_orders"],
    prerequisites: [{ key: "partner_center_app", label: "Đã đăng ký ứng dụng trên Partner Center" }],
    configSchema: noConfig,
    secrets: [],
  },
  {
    key: "zalo_zns",
    name: "Tin ZNS",
    description: "Gửi tin mẫu xác nhận đơn, lịch giao tới số điện thoại Việt Nam.",
    group: "channels",
    phase: "month_3",
    implemented: false,
    capabilities: ["outbound_messages"],
    prerequisites: [{ key: "zns_templates", label: "Mẫu tin ZNS đã được duyệt" }],
    configSchema: noConfig,
    secrets: [],
  },
  {
    key: "meta_capi",
    name: "Gửi chuyển đổi về Facebook",
    description: "Gửi sự kiện đặt cọc, giao xong về Facebook cho khách đã đồng ý.",
    group: "ads_measurement",
    phase: "month_2",
    implemented: false,
    capabilities: ["outbound_events"],
    prerequisites: [{ key: "pixel", label: "Đã có Pixel hoặc tập dữ liệu sự kiện" }],
    configSchema: noConfig,
    secrets: [],
  },
  {
    key: "tiktok_events",
    name: "Gửi chuyển đổi về TikTok",
    description: "Gửi sự kiện chuyển đổi về TikTok cho khách đã đồng ý.",
    group: "ads_measurement",
    phase: "month_2",
    implemented: false,
    capabilities: ["outbound_events"],
    prerequisites: [],
    configSchema: noConfig,
    secrets: [],
  },
  {
    key: "bank_webhook",
    name: "Báo tiền về tài khoản",
    description: "Tự khớp tiền khách chuyển khoản với đơn theo nội dung chuyển khoản.",
    group: "finance",
    phase: "month_2",
    implemented: false,
    capabilities: ["inbound_payments"],
    prerequisites: [{ key: "company_account", label: "Tài khoản ngân hàng đứng tên pháp nhân" }],
    configSchema: noConfig,
    secrets: [],
  },
  {
    key: "einvoice",
    name: "Hóa đơn điện tử",
    description: "Xuất hóa đơn điện tử khi đơn hoàn tất.",
    group: "finance",
    phase: "month_3",
    implemented: false,
    capabilities: ["outbound_invoices"],
    prerequisites: [{ key: "einvoice_provider", label: "Đã chọn nhà cung cấp hóa đơn điện tử" }],
    configSchema: noConfig,
    secrets: [],
  },
  {
    key: "file_storage",
    name: "Lưu video bàn giao",
    description: "Lưu ảnh, video lắp đặt trong kho lưu trữ riêng tư.",
    group: "operations",
    phase: "month_2",
    implemented: false,
    capabilities: ["file_storage"],
    prerequisites: [],
    configSchema: noConfig,
    secrets: [],
  },
  {
    key: "mcp_server",
    name: "Cổng dữ liệu cho trợ lý AI",
    description: "Cho trợ lý AI đọc dữ liệu CRM theo đúng quyền của người đang dùng.",
    group: "ai",
    phase: "month_2",
    implemented: false,
    capabilities: ["ai_processing"],
    prerequisites: [],
    configSchema: noConfig,
    secrets: [],
  },
  {
    key: "ai_speech",
    name: "Chuyển ghi âm thành văn bản",
    description: "Chép lời cuộc gọi tiếng Việt từ ghi âm tổng đài.",
    group: "ai",
    phase: "month_3",
    implemented: false,
    capabilities: ["ai_processing"],
    prerequisites: [{ key: "recordings", label: "Tổng đài đã có ghi âm" }],
    configSchema: noConfig,
    secrets: [],
  },
  {
    key: "ai_llm",
    name: "Trợ lý AI",
    description: "Tóm tắt, gợi ý việc tiếp theo, offer phù hợp và soạn tin; người duyệt trước khi dùng.",
    group: "ai",
    phase: "month_3",
    implemented: false,
    capabilities: ["ai_processing"],
    prerequisites: [],
    configSchema: noConfig,
    secrets: [],
  },
] as const satisfies readonly IntegrationDefinition[];

export type IntegrationKey = (typeof integrations)[number]["key"];

export const groupLabels: Record<IntegrationGroup, string> = {
  channels: "Kênh khách hàng",
  calls: "Gọi điện",
  ads_measurement: "Đo lường quảng cáo",
  finance: "Tài chính",
  operations: "Vận hành",
  ai: "AI",
};

export const phaseLabels: Record<IntegrationPhase, string> = {
  month_1: "Tháng 1",
  month_2: "Tháng 2",
  month_3: "Tháng 3",
  when_available: "Khi có",
  optional: "Tùy chọn",
};

export function getIntegration(key: IntegrationKey): IntegrationDefinition {
  const found = integrations.find((i) => i.key === key);
  if (!found) throw new Error(`Unknown integration: ${key}`);
  return found;
}
