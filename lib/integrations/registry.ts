import { z } from "zod";

// Sổ đăng ký đấu nối (CLAUDE.md mục 10.2, 10.3). Trang Cài đặt, Tích hợp đọc từ đây.
// `implemented` cho biết đã có adapter thật hay chưa; bản demo mô phỏng kết nối cho mọi đấu nối có `connectMode`.
// Đấu nối không có `connectMode` hiện "Sắp có" kèm điều kiện tiên quyết.

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
  | "ai_processing"
  | "staff_notifications";

export type IntegrationPhase = "month_1" | "month_2" | "month_3" | "when_available" | "optional";

export interface Prerequisite {
  key: string;
  label: string;
  helpUrl?: string;
}

/** oauth: Owner đăng nhập nhà cung cấp; api_key: nhập khóa; enable: dịch vụ nội bộ, chỉ cần bật. */
export type ConnectMode = "oauth" | "api_key" | "enable";

/** Ô cấu hình không bí mật hiện trên tab Cấu hình; giá trị kiểm bằng `configSchema`. */
export interface ConfigField {
  key: string;
  label: string;
  kind: "text" | "list" | "mapping" | "select" | "checks";
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Giá trị điền sẵn để Owner không phải nhập; sửa được ở tab Cấu hình. */
  default?: string | readonly string[] | Readonly<Record<string, string>>;
  /**
   * Chọn từ danh sách nhà cung cấp trả về sau khi đăng nhập (Page, form, OA…), không phải gõ ID.
   * `options` là danh sách mô phỏng; khi chạy thật, server lấy danh sách qua API bằng token vừa nhận.
   */
  fromLogin?: boolean;
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
  /** Quyền CRM xin khi Owner đăng nhập OAuth. */
  oauthScopes?: string;
  /** Loại sự kiện ghi nhật ký khi bấm "Gửi dữ liệu thử". */
  testLabel?: string;
  /** Lưu ý nghiệp vụ hiện trong chi tiết đấu nối. */
  note?: string;
  /** Đường dẫn webhook Owner dán vào trang quản trị của nhà cung cấp (đấu nối có dữ liệu đẩy về). */
  webhookPath?: string;
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

const digits = (message: string) => z.string().regex(/^\d{5,25}$/, message);

/** Ánh xạ đoán sẵn theo câu hỏi form mẫu; Owner chỉnh ở tab Cấu hình nếu form khác. */
const FORM_MAPPING_DEFAULT = {
  "Họ và tên": "full_name",
  "Số điện thoại": "phone",
  "Bạn đang sống ở nước nào?": "country_of_residence",
  "Tỉnh người nhận quà": "recipient_province",
  "Bạn quan tâm sản phẩm nào?": "product_interest",
  "Dịp tặng quà": "occasion",
};

const CONVERSION_EVENTS = [
  { value: "deposit", label: "Đặt cọc" },
  { value: "delivered", label: "Giao lắp xong" },
  { value: "repeat", label: "Mua lại, mua thêm" },
];

export const integrations = [
  {
    key: "meta_lead_ads",
    webhookPath: "/api/webhooks/meta",
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
    oauthScopes: "Facebook: pages_show_list, pages_manage_metadata, leads_retrieval, pages_read_engagement",
    testLabel: "Lead thử từ công cụ test lead của Meta",
    configFields: [
      {
        key: "pageId",
        label: "Page Facebook",
        kind: "select",
        fromLogin: true,
        options: [{ value: "104857300000001", label: "Đại Việt Showroom Quận 4" }],
      },
      {
        key: "formIds",
        label: "Các form cần nhận",
        kind: "checks",
        fromLogin: true,
        options: [
          { value: "2200000000001", label: "Ghế massage, người Việt tại Hàn" },
          { value: "2200000000002", label: "Máy lọc nước, khách trong nước" },
        ],
      },
      {
        key: "fieldMapping",
        label: "Ánh xạ câu hỏi của form sang trường lead",
        kind: "mapping",
        default: FORM_MAPPING_DEFAULT,
      },
    ],
    secretLabels: {
      meta_app_secret: "App Secret của ứng dụng Meta (kiểm chữ ký webhook)",
      meta_page_access_token: "Page access token (lấy qua đăng nhập Facebook)",
    },
  },
  {
    key: "zalo_oa",
    webhookPath: "/api/webhooks/zalo",
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
    oauthScopes: "Zalo OA: đọc và gửi tin nhắn, đọc thông tin người theo dõi",
    testLabel: "Tin nhắn thử từ Zalo OA",
    configFields: [
      {
        key: "oaId",
        label: "Zalo OA",
        kind: "select",
        fromLogin: true,
        options: [{ value: "4318000000000000001", label: "Đại Việt Showroom Quận 4 (OA)" }],
      },
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
      { key: "port", label: "Cổng", kind: "text", placeholder: "587", default: "587" },
      { key: "username", label: "Tên đăng nhập", kind: "text" },
      {
        key: "fromAddress",
        label: "Địa chỉ gửi",
        kind: "text",
        placeholder: "no-reply@daivietshowroomq4.vn",
      },
    ],
    secretLabels: { smtp_password: "Mật khẩu SMTP" },
    testLabel: "Thư thử gửi tới Owner",
  },
  {
    key: "call_provider",
    webhookPath: "/api/webhooks/call/mock",
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
        default: "mock",
        options: [{ value: "mock", label: "Tổng đài giả lập (kiểm thử)" }],
      },
    ],
    secretLabels: { call_provider_api_key: "API key tổng đài" },
    testLabel: "Cuộc gọi thử qua tổng đài giả lập",
  },
  {
    key: "pancake",
    webhookPath: "/api/webhooks/pancake",
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
    testLabel: "Đọc hội thoại thử từ Pancake",
    note: 'Pancake chỉ đưa hội thoại vào CRM để đọc. Kênh đội đang trả lời ở Pancake thì đặt chế độ "Trả lời ở công cụ khác" ở chính kênh đó (Zalo OA, Tin nhắn Facebook).',
  },
  {
    key: "meta_messenger",
    webhookPath: "/api/webhooks/meta",
    name: "Tin nhắn Facebook",
    description: "Nhận và trả lời tin nhắn Facebook trong 24 giờ sau tin cuối của khách.",
    group: "channels",
    phase: "month_2",
    implemented: false,
    capabilities: ["inbound_messages", "outbound_messages"],
    prerequisites: [
      { key: "messaging_permission", label: "Ứng dụng Meta đã được duyệt quyền nhắn tin" },
      {
        key: "page_tasks",
        label: "Người bấm kết nối có quyền Nhắn tin và Kiểm duyệt trên Page",
        helpUrl: "docs/integrations/meta_messenger.md",
      },
      { key: "one_reply_place", label: "Page này không còn được trả lời ở Pancake hoặc công cụ khác" },
    ],
    configSchema: z.object({ pageId: digits("ID Page là dãy số") }),
    secrets: ["messenger_app_secret", "messenger_page_access_token"],
    connectMode: "oauth",
    oauthScopes:
      "Facebook: pages_messaging, pages_manage_metadata, pages_show_list, pages_read_engagement, business_management",
    configFields: [
      {
        key: "pageId",
        label: "Page Facebook",
        kind: "select",
        fromLogin: true,
        options: [{ value: "104857300000001", label: "Đại Việt Showroom Quận 4" }],
      },
    ],
    secretLabels: {
      messenger_app_secret: "App Secret của ứng dụng Meta (kiểm chữ ký webhook)",
      messenger_page_access_token: "Page access token (lấy qua đăng nhập Facebook)",
    },
    testLabel: "Tin nhắn thử từ Messenger",
    supportsReplyMode: true,
  },
  {
    key: "tiktok_lead_forms",
    webhookPath: "/api/webhooks/tiktok",
    name: "Form quảng cáo TikTok",
    description: "Nhận lead từ form quảng cáo TikTok.",
    group: "channels",
    phase: "month_2",
    implemented: false,
    capabilities: ["inbound_leads"],
    prerequisites: [{ key: "tiktok_ads_app", label: "Tài khoản quảng cáo đã ủy quyền cho ứng dụng" }],
    configSchema: z.object({
      advertiserId: digits("ID tài khoản quảng cáo là dãy số"),
      formIds: z.array(digits("ID form là dãy số")).min(1, "Chọn ít nhất một form"),
      fieldMapping: z.record(z.string(), z.string()).default({}),
    }),
    secrets: ["tiktok_app_secret", "tiktok_ads_access_token"],
    connectMode: "oauth",
    oauthScopes: "TikTok for Business: quản lý lead (đọc lead Instant Form)",
    configFields: [
      {
        key: "advertiserId",
        label: "Tài khoản quảng cáo TikTok",
        kind: "select",
        fromLogin: true,
        options: [{ value: "7200000000000000001", label: "Đại Việt Q4 Ads" }],
      },
      {
        key: "formIds",
        label: "Các form cần nhận",
        kind: "checks",
        fromLogin: true,
        options: [{ value: "7300000000001", label: "Form ghế massage TikTok" }],
      },
      {
        key: "fieldMapping",
        label: "Ánh xạ câu hỏi của form sang trường lead",
        kind: "mapping",
        default: FORM_MAPPING_DEFAULT,
      },
    ],
    secretLabels: {
      tiktok_app_secret: "App secret của ứng dụng TikTok (kiểm chữ ký webhook)",
      tiktok_ads_access_token: "Access token quảng cáo (lấy qua đăng nhập TikTok)",
    },
    testLabel: "Lead thử từ form TikTok",
  },
  {
    key: "tiktok_messaging",
    webhookPath: "/api/webhooks/tiktok",
    name: "Tin nhắn TikTok",
    description: "Nhận và trả lời tin nhắn TikTok khi được TikTok cấp quyền.",
    group: "channels",
    phase: "when_available",
    implemented: false,
    capabilities: ["inbound_messages", "outbound_messages"],
    prerequisites: [
      { key: "tiktok_messaging_access", label: "Đã được cấp quyền Business Messaging API" },
      { key: "tiktok_vn_open", label: "Đã xác nhận TikTok mở Business Messaging cho Việt Nam" },
    ],
    configSchema: z.object({ businessId: digits("ID tài khoản TikTok Business là dãy số") }),
    secrets: ["tiktok_msg_app_secret", "tiktok_msg_access_token"],
    connectMode: "oauth",
    oauthScopes: "TikTok Business Messaging: đọc và trả lời tin khách nhắn trước",
    configFields: [
      {
        key: "businessId",
        label: "Tài khoản TikTok Business",
        kind: "select",
        fromLogin: true,
        options: [{ value: "7300000000000000001", label: "@daivietq4" }],
      },
    ],
    secretLabels: {
      tiktok_msg_app_secret: "App secret của ứng dụng TikTok (kiểm chữ ký webhook)",
      tiktok_msg_access_token: "Access token nhắn tin (lấy qua đăng nhập TikTok)",
    },
    testLabel: "Tin nhắn thử từ TikTok",
    supportsReplyMode: true,
  },
  {
    key: "tiktok_shop",
    webhookPath: "/api/webhooks/tiktok-shop",
    name: "TikTok Shop",
    description: "Đưa đơn TikTok Shop về cùng danh sách đơn hàng.",
    group: "channels",
    phase: "month_3",
    implemented: false,
    capabilities: ["inbound_orders"],
    prerequisites: [
      { key: "partner_center_app", label: "Đã đăng ký ứng dụng trên Partner Center" },
      { key: "shop_authorized", label: "Shop đã ủy quyền cho ứng dụng" },
    ],
    configSchema: z.object({
      shopId: z.string().regex(/^[A-Za-z0-9]{5,30}$/, "ID shop gồm chữ và số"),
      warehouseId: z.enum(["wh-q4", "wh-dv"], "Chọn kho giữ hàng cho đơn TikTok Shop"),
    }),
    secrets: ["tiktok_shop_app_secret", "tiktok_shop_access_token"],
    connectMode: "oauth",
    oauthScopes: "TikTok Shop: đọc đơn hàng, cập nhật trạng thái giao",
    configFields: [
      {
        key: "shopId",
        label: "Shop TikTok",
        kind: "select",
        fromLogin: true,
        options: [{ value: "7495000001", label: "Đại Việt Official" }],
      },
      {
        key: "warehouseId",
        label: "Kho giữ hàng cho đơn sàn",
        kind: "select",
        default: "wh-q4",
        options: [
          { value: "wh-q4", label: "Kho showroom Q4" },
          { value: "wh-dv", label: "Kho Đại Việt" },
        ],
      },
    ],
    secretLabels: {
      tiktok_shop_app_secret: "App secret trên Partner Center (kiểm chữ ký webhook)",
      tiktok_shop_access_token: "Access token shop (lấy qua ủy quyền shop)",
    },
    testLabel: "Đơn thử từ TikTok Shop (không giữ hàng)",
  },
  {
    key: "zalo_zns",
    name: "Tin ZNS",
    description: "Gửi tin mẫu xác nhận đơn, lịch giao tới số điện thoại Việt Nam.",
    group: "channels",
    phase: "month_3",
    implemented: false,
    capabilities: ["outbound_messages"],
    prerequisites: [
      { key: "zns_templates", label: "Mẫu tin ZNS đã được duyệt" },
      { key: "zca_balance", label: "Tài khoản Zalo Cloud đã nạp tiền" },
    ],
    configSchema: z.object({
      orderTemplateId: digits("ID mẫu là dãy số"),
      deliveryTemplateId: digits("ID mẫu là dãy số"),
    }),
    secrets: ["zns_app_secret", "zns_access_token"],
    connectMode: "oauth",
    oauthScopes: "Zalo OA: gửi tin ZNS theo mẫu đã duyệt",
    configFields: [
      {
        key: "orderTemplateId",
        label: "Mẫu xác nhận đơn",
        kind: "select",
        fromLogin: true,
        options: [{ value: "312345", label: "Xác nhận đơn hàng (đã duyệt)" }],
      },
      {
        key: "deliveryTemplateId",
        label: "Mẫu lịch giao lắp",
        kind: "select",
        fromLogin: true,
        options: [{ value: "312346", label: "Lịch giao lắp (đã duyệt)" }],
      },
    ],
    secretLabels: {
      zns_app_secret: "Secret key của ứng dụng Zalo",
      zns_access_token: "Access token ZNS (lấy qua đăng nhập Zalo OA)",
    },
    testLabel: "Tin ZNS thử tới số Việt Nam của Owner",
    note: "Chỉ gửi tới số Việt Nam. Người đặt ở nước ngoài dùng số +82 nhận tin qua Zalo OA.",
  },
  {
    key: "meta_capi",
    name: "Gửi chuyển đổi về Facebook",
    description: "Gửi sự kiện đặt cọc, giao xong về Facebook cho khách đã đồng ý.",
    group: "ads_measurement",
    phase: "month_2",
    implemented: false,
    capabilities: ["outbound_events"],
    prerequisites: [
      { key: "pixel", label: "Đã có Pixel hoặc tập dữ liệu sự kiện" },
      { key: "consent_text", label: "Form và kịch bản gọi đã có câu xin đồng ý gửi dữ liệu đo lường" },
    ],
    configSchema: z.object({
      datasetId: digits("ID tập dữ liệu là dãy số"),
      events: z.array(z.string()).min(1, "Chọn ít nhất một sự kiện"),
    }),
    secrets: ["capi_access_token"],
    connectMode: "api_key",
    configFields: [
      {
        key: "datasetId",
        label: "ID Pixel hoặc tập dữ liệu",
        kind: "text",
        placeholder: "Ví dụ 880000000000001",
      },
      {
        key: "events",
        label: "Sự kiện gửi về",
        kind: "checks",
        options: CONVERSION_EVENTS,
        default: ["deposit", "delivered"],
      },
    ],
    secretLabels: { capi_access_token: "Access token Conversions API" },
    testLabel: "Sự kiện thử (số điện thoại đã băm SHA-256, chỉ khách đã đồng ý)",
    note: "Chỉ gửi khách có đồng ý mục đích đo lường quảng cáo; số điện thoại và email băm SHA-256 trước khi gửi.",
  },
  {
    key: "tiktok_events",
    name: "Gửi chuyển đổi về TikTok",
    description: "Gửi sự kiện chuyển đổi về TikTok cho khách đã đồng ý.",
    group: "ads_measurement",
    phase: "month_2",
    implemented: false,
    capabilities: ["outbound_events"],
    prerequisites: [
      { key: "tiktok_pixel", label: "Đã có TikTok Pixel" },
      { key: "consent_text", label: "Form và kịch bản gọi đã có câu xin đồng ý gửi dữ liệu đo lường" },
    ],
    configSchema: z.object({
      pixelCode: z.string().regex(/^[A-Z0-9]{10,30}$/, "Mã Pixel gồm chữ in hoa và số"),
      events: z.array(z.string()).min(1, "Chọn ít nhất một sự kiện"),
    }),
    secrets: ["tiktok_events_token"],
    connectMode: "api_key",
    configFields: [
      { key: "pixelCode", label: "Mã TikTok Pixel", kind: "text", placeholder: "Ví dụ CABC123DEF456GH" },
      {
        key: "events",
        label: "Sự kiện gửi về",
        kind: "checks",
        options: CONVERSION_EVENTS,
        default: ["deposit", "delivered"],
      },
    ],
    secretLabels: { tiktok_events_token: "Access token Events API" },
    testLabel: "Sự kiện thử (đã băm SHA-256, chỉ khách đã đồng ý)",
    note: "Chỉ gửi khách có đồng ý mục đích đo lường quảng cáo; dữ liệu định danh băm SHA-256 trước khi gửi.",
  },
  {
    key: "bank_webhook",
    webhookPath: "/api/webhooks/bank",
    name: "Báo tiền về tài khoản",
    description: "Tự khớp tiền khách chuyển khoản với đơn theo nội dung chuyển khoản.",
    group: "finance",
    phase: "month_2",
    implemented: false,
    capabilities: ["inbound_payments"],
    prerequisites: [
      { key: "company_account", label: "Tài khoản ngân hàng đứng tên pháp nhân" },
      { key: "legal_remittance", label: "Tiền từ nước ngoài chỉ nhận qua ngân hàng hoặc kiều hối hợp pháp" },
    ],
    configSchema: z.object({
      provider: z.enum(["sepay", "casso"], "Chọn dịch vụ báo số dư"),
      bankName: z.string().min(2, "Nhập tên ngân hàng"),
      accountNumber: z.string().regex(/^\d{6,20}$/, "Số tài khoản là dãy số"),
    }),
    secrets: ["bank_api_key", "bank_webhook_secret"],
    connectMode: "api_key",
    configFields: [
      {
        key: "provider",
        label: "Dịch vụ báo biến động số dư",
        kind: "select",
        options: [
          { value: "sepay", label: "SePay" },
          { value: "casso", label: "Casso" },
        ],
      },
      { key: "bankName", label: "Ngân hàng", kind: "text", placeholder: "Ví dụ Vietcombank" },
      { key: "accountNumber", label: "Số tài khoản nhận", kind: "text", placeholder: "Ví dụ 0071000123456" },
    ],
    secretLabels: { bank_api_key: "API key dịch vụ", bank_webhook_secret: "Khóa ký webhook" },
    testLabel: "Giao dịch thử, nội dung có mã đơn",
    note: "Nội dung chuyển khoản theo mã đơn (Q4-2610-0001) để tự khớp; giao dịch không khớp vào hàng chờ sale admin. Tiền khớp vẫn cần người xác nhận cho tới khi Owner bật tự xác nhận.",
  },
  {
    key: "einvoice",
    name: "Hóa đơn điện tử",
    description: "Xuất hóa đơn điện tử khi đơn hoàn tất.",
    group: "finance",
    phase: "month_3",
    implemented: false,
    capabilities: ["outbound_invoices"],
    prerequisites: [
      { key: "einvoice_provider", label: "Đã chọn nhà cung cấp hóa đơn điện tử" },
      { key: "legal_entity", label: "Đã chốt pháp nhân xuất hóa đơn" },
    ],
    configSchema: z.object({
      provider: z.enum(["misa", "viettel", "vnpt"], "Chọn nhà cung cấp hóa đơn"),
      taxCode: z.string().regex(/^\d{10}(-\d{3})?$/, "Mã số thuế gồm 10 số, chi nhánh thêm -xxx"),
      serial: z.string().regex(/^[0-9A-Z]{6,8}$/, "Ký hiệu hóa đơn gồm 6 đến 8 ký tự in hoa, ví dụ 1C26TDV"),
      username: z.string().min(1, "Nhập tài khoản API"),
    }),
    secrets: ["einvoice_password"],
    connectMode: "api_key",
    configFields: [
      {
        key: "provider",
        label: "Nhà cung cấp",
        kind: "select",
        options: [
          { value: "misa", label: "MISA meInvoice" },
          { value: "viettel", label: "Viettel SInvoice" },
          { value: "vnpt", label: "VNPT Invoice" },
        ],
      },
      { key: "taxCode", label: "Mã số thuế", kind: "text", placeholder: "Ví dụ 0312345678" },
      { key: "serial", label: "Ký hiệu hóa đơn", kind: "text", placeholder: "Ví dụ 1C26TDV" },
      { key: "username", label: "Tài khoản API", kind: "text" },
    ],
    secretLabels: { einvoice_password: "Mật khẩu API hóa đơn" },
    testLabel: "Hóa đơn nháp thử (không phát hành)",
  },
  {
    key: "telegram_bot",
    webhookPath: "/api/webhooks/telegram",
    name: "Thông báo Telegram cho nhân viên",
    description:
      "Bot báo lead mới, giờ hẹn, việc chờ duyệt, đơn đổi trạng thái lên Telegram; nút Mở CRM mở Mini App trên điện thoại.",
    group: "operations",
    phase: "month_2",
    implemented: true,
    capabilities: ["staff_notifications"],
    prerequisites: [
      { key: "bot_created", label: "Owner đã tạo bot qua @BotFather và giữ token" },
      { key: "https_domain", label: "CRM đã có tên miền HTTPS (cho webhook và Mini App)" },
      {
        key: "data_rule",
        label:
          "Đã chốt: tin chỉ báo có việc hoặc tên gọi ngắn, không số điện thoại, không nội dung tin khách",
      },
    ],
    configSchema: z.object({
      botUsername: z
        .string()
        .regex(/^[A-Za-z0-9_]{2,29}bot$/i, "Tên bot kết thúc bằng bot, ví dụ DaiVietQ4Bot"),
    }),
    secrets: ["telegram_bot_token", "telegram_webhook_secret"],
    connectMode: "api_key",
    configFields: [{ key: "botUsername", label: "Tên bot", kind: "text", placeholder: "DaiVietQ4Bot" }],
    secretLabels: {
      telegram_bot_token: "Token của bot (từ @BotFather)",
      telegram_webhook_secret: "Mã bí mật webhook (tự đặt, Telegram gửi kèm mỗi lần gọi về)",
    },
    testLabel: "Tin thử gửi tới Telegram của Owner",
    note: "Mỗi nhân viên tự liên kết Telegram ở Cài đặt, Thông báo Telegram. Tin không chứa số điện thoại hay nội dung tin nhắn của khách; muốn xem chi tiết thì bấm Mở CRM.",
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
    configSchema: z.object({
      provider: z.enum(["supabase"], "Chọn nơi lưu"),
      linkMinutes: z.string().regex(/^([1-9]|[1-5]\d|60)$/, "Thời hạn link từ 1 đến 60 phút"),
    }),
    secrets: [],
    connectMode: "enable",
    configFields: [
      {
        key: "provider",
        label: "Nơi lưu",
        kind: "select",
        default: "supabase",
        options: [{ value: "supabase", label: "Supabase Storage, bucket riêng tư" }],
      },
      {
        key: "linkMinutes",
        label: "Thời hạn link xem (phút)",
        kind: "text",
        placeholder: "10",
        default: "10",
      },
    ],
    testLabel: "Tải ảnh thử lên kho riêng tư, tạo link ký ngắn hạn",
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
    configSchema: z.object({ tools: z.array(z.string()).min(1, "Chọn ít nhất một nhóm dữ liệu") }),
    secrets: [],
    connectMode: "enable",
    configFields: [
      {
        key: "tools",
        label: "Nhóm dữ liệu được đọc (chỉ đọc)",
        kind: "checks",
        default: ["leads", "customers", "orders", "products", "tasks"],
        options: [
          { value: "leads", label: "Lead và cơ hội" },
          { value: "customers", label: "Hồ sơ khách 360" },
          { value: "orders", label: "Báo giá, đơn hàng" },
          { value: "products", label: "Sản phẩm, tồn khả dụng, chính sách" },
          { value: "tasks", label: "Việc cần làm" },
        ],
      },
    ],
    testLabel: "Gọi thử công cụ đọc dưới quyền Owner",
    note: "Chỉ đọc, chạy dưới quyền người đang dùng; không trả số điện thoại đầy đủ hay giá vốn.",
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
    configSchema: z.object({
      provider: z.enum(["google", "fpt", "viettel"], "Chọn nhà cung cấp"),
      retentionDays: z.string().regex(/^\d{1,3}$/, "Số ngày giữ bản chép là số"),
    }),
    secrets: ["ai_speech_api_key"],
    connectMode: "api_key",
    configFields: [
      {
        key: "provider",
        label: "Nhà cung cấp",
        kind: "select",
        options: [
          { value: "google", label: "Google Cloud Speech-to-Text" },
          { value: "fpt", label: "FPT.AI Speech" },
          { value: "viettel", label: "Viettel AI" },
        ],
      },
      { key: "retentionDays", label: "Giữ bản chép (ngày)", kind: "text", placeholder: "90", default: "90" },
    ],
    secretLabels: { ai_speech_api_key: "API key chuyển giọng nói" },
    testLabel: "Chép thử một đoạn ghi âm mẫu",
  },
  {
    key: "ai_llm",
    name: "Trợ lý AI",
    description: "Tóm tắt, gợi ý việc tiếp theo, offer phù hợp và soạn tin; người duyệt trước khi dùng.",
    group: "ai",
    phase: "month_3",
    implemented: false,
    capabilities: ["ai_processing"],
    prerequisites: [{ key: "ai_policy", label: "Đã thống nhất việc AI được làm và người duyệt" }],
    configSchema: z.object({
      model: z.enum(["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5"], "Chọn mô hình"),
      features: z.array(z.string()).default([]),
      monthlyBudget: z.string().regex(/^\d{1,12}$/, "Giới hạn chi phí là số đồng"),
    }),
    secrets: ["ai_llm_api_key"],
    connectMode: "api_key",
    configFields: [
      {
        key: "model",
        label: "Mô hình",
        kind: "select",
        default: "claude-sonnet-5-5",
        options: [
          { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (cân bằng)" },
          { value: "claude-opus-5-5", label: "Claude Opus 5.5 (mạnh nhất)" },
          { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (nhanh, rẻ)" },
        ],
      },
      {
        key: "features",
        label: "Chức năng bật (mặc định tắt hết)",
        kind: "checks",
        default: [],
        options: [
          { value: "summary", label: "Tóm tắt hồ sơ khách, cuộc gọi" },
          { value: "next_task", label: "Đề xuất việc tiếp theo" },
          { value: "offer", label: "Đề xuất offer qua hàm định giá" },
          { value: "draft", label: "Soạn tin nháp" },
          { value: "household", label: "Đề xuất gộp hộ" },
        ],
      },
      {
        key: "monthlyBudget",
        label: "Giới hạn chi phí tháng (đồng)",
        kind: "text",
        placeholder: "2000000",
        default: "2000000",
      },
    ],
    secretLabels: { ai_llm_api_key: "API key mô hình ngôn ngữ" },
    testLabel: "Câu hỏi thử (đã che số điện thoại)",
    note: "Mọi kết quả AI là đề xuất có người xác nhận; không gửi số điện thoại đầy đủ hay giấy tờ tùy thân sang mô hình.",
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
