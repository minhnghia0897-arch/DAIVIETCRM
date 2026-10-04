// Dữ liệu mô phỏng cho phần vận hành: hồ sơ lead (4 thông tin bắt buộc), việc cần làm, danh mục, thị trường,
// luật sinh việc. Thời gian tính bằng phút trong ngày mô phỏng (giờ VN). Toàn bộ là dữ liệu giả.

export type Market = "KR" | "VN";

export interface LeadInfo {
  market: Market;
  /** "self": mua cho chính mình; "other": tặng người khác; "": chưa hỏi. */
  buyFor: "self" | "other" | "";
  recipientName: string;
  recipientRelation: string;
  recipientProvince: string;
  occasion: string;
  occasionDate: string;
  budget: string;
  keepSurprise: boolean;
  /** Số đầy đủ chỉ dùng khi bấm Gọi có quyền; giao diện mặc định hiện số che. */
  buyerPhone: string;
  buyerPhoneMasked: string;
  recipientPhone: string;
  recipientPhoneMasked: string;
  dates: { label: string; date: string }[];
  tags: string[];
}

const empty = (market: Market, phone: string, masked: string): LeadInfo => ({
  market,
  buyFor: "",
  recipientName: "",
  recipientRelation: "",
  recipientProvince: "",
  occasion: "",
  occasionDate: "",
  budget: "",
  keepSurprise: false,
  buyerPhone: phone,
  buyerPhoneMasked: masked,
  recipientPhone: "",
  recipientPhoneMasked: "",
  dates: [],
  tags: [],
});

export const LEAD_INFO: Record<string, LeadInfo> = {
  o1: {
    ...empty("KR", "+82 10 5521 2290", "+82 10•••2290"),
    buyFor: "other",
    recipientName: "Nguyễn Văn Lực",
    recipientRelation: "Bố",
    recipientProvince: "Nghệ An",
    occasion: "Tết",
    occasionDate: "2027-02-06",
    budget: "Trên 80tr",
    keepSurprise: true,
    recipientPhone: "",
    recipientPhoneMasked: "Chưa có",
    dates: [{ label: "Sinh nhật bố", date: "03/12" }],
  },
  o2: {
    ...empty("KR", "+82 10 7734 8812", "+82 10•••8812"),
    buyFor: "other",
    recipientName: "Phạm Văn Tư",
    recipientRelation: "Bố",
    recipientProvince: "TP.HCM",
    occasion: "Không có dịp, dùng cho gia đình",
    budget: "30–50tr",
    recipientPhone: "+84 91 223 4630",
    recipientPhoneMasked: "091•••630",
  },
  o3: {
    ...empty("KR", "+82 10 3390 5103", "+82 10•••5103"),
    buyFor: "other",
    recipientName: "Ngô Thị Út",
    recipientRelation: "Mẹ",
    recipientProvince: "Đồng Tháp",
    occasion: "20/10",
    occasionDate: "2026-10-20",
    recipientPhoneMasked: "Chưa có",
  },
  o4: {
    ...empty("KR", "+82 10 2245 4471", "+82 10•••4471"),
    buyFor: "other",
    recipientName: "Trần Văn Bảy",
    recipientRelation: "Bố",
    recipientProvince: "Long An",
    occasion: "Mừng thọ",
    occasionDate: "2026-11-12",
    budget: "Dưới 30tr",
    recipientPhone: "+84 90 551 7215",
    recipientPhoneMasked: "090•••215",
    dates: [{ label: "Bố tròn 70 tuổi", date: "12/11" }],
  },
  o5: empty("KR", "+82 10 6612 0937", "+82 10•••0937"),
  o6: {
    ...empty("KR", "+82 10 8820 3318", "+82 10•••3318"),
    buyFor: "other",
    recipientName: "Mẹ anh Khoa",
    recipientRelation: "Mẹ",
    recipientProvince: "Hải Dương",
    occasion: "Sinh nhật",
    budget: "Trên 80tr",
  },
  o7: {
    ...empty("KR", "+82 10 4471 9902", "+82 10•••9902"),
    buyFor: "other",
    recipientName: "Lương Văn Hòa",
    recipientRelation: "Bố",
    recipientProvince: "Bắc Giang",
    occasion: "Tết",
    budget: "30–50tr",
    tags: ["referral"],
  },
  o8: {
    ...empty("VN", "+84 93 812 5577", "093•••577"),
    buyFor: "self",
    recipientProvince: "TP.HCM",
    occasion: "Không có dịp, dùng cho gia đình",
    budget: "Dưới 30tr",
  },
  o9: {
    ...empty("KR", "+82 10 9013 6650", "+82 10•••6650"),
    buyFor: "other",
    recipientName: "Chưa xác nhận",
    recipientRelation: "Bố mẹ",
    recipientProvince: "Hà Tĩnh",
    occasion: "Tết",
    budget: "Trên 80tr",
    keepSurprise: true,
    recipientPhoneMasked: "Chưa có",
  },
  o10: {
    ...empty("KR", "+82 10 5578 7716", "+82 10•••7716"),
    buyFor: "other",
    recipientName: "Võ Văn Hai",
    recipientRelation: "Bố",
    recipientProvince: "Bình Dương",
    occasion: "Không có dịp, dùng cho gia đình",
    budget: "Trên 80tr",
    recipientPhone: "+84 97 330 2441",
    recipientPhoneMasked: "097•••441",
  },
};

export function newLeadInfo(market: Market): LeadInfo {
  return empty(
    market,
    market === "KR" ? "+82 10 0000 0000" : "+84 90 000 0000",
    market === "KR" ? "+82 10•••0000" : "090•••000",
  );
}

/** Bốn thông tin telesale phải hỏi ở cuộc gọi đầu (CLAUDE.md mục 6). Trả về danh sách còn thiếu. */
export function missingInfo(i: LeadInfo): string[] {
  const out: string[] = [];
  if (!i.buyFor || (i.buyFor === "other" && !i.recipientRelation)) out.push("Mua cho ai");
  if (!i.recipientProvince) out.push("Tỉnh người nhận");
  if (!i.occasion) out.push("Dịp mua");
  if (!i.budget) out.push("Ngân sách");
  return out;
}

// ---------------------------------------------------------------------------
// Danh mục mặc định (CLAUDE.md mục 6), sửa được trong Cài đặt
// ---------------------------------------------------------------------------

export interface CatalogItem {
  id: string;
  label: string;
  active: boolean;
}

const items = (prefix: string, labels: string[]): CatalogItem[] =>
  labels.map((label, i) => ({ id: `${prefix}${i + 1}`, label, active: true }));

export const CATALOGS: Record<string, { title: string; items: CatalogItem[] }> = {
  sources: {
    title: "Nguồn lead",
    items: items("src", [
      "Facebook Ads nhắm người Việt tại Hàn",
      "Facebook Ads trong nước",
      "Tin nhắn Facebook",
      "Zalo OA",
      "Live TikTok",
      "KOC, KOL",
      "TikTok Shop",
      "Khách đến showroom",
      "Hotline",
      "Giới thiệu từ khách cũ",
      "Dữ liệu cũ nhập lại",
    ]),
  },
  occasions: {
    title: "Dịp tặng",
    items: items("occ", [
      "Tết",
      "20/10",
      "8/3",
      "Sinh nhật",
      "Mừng thọ",
      "Vu Lan",
      "Tân gia",
      "Không có dịp, dùng cho gia đình",
    ]),
  },
  outcomes: {
    title: "Kết quả cuộc gọi",
    items: items("out", [
      "Nghe máy, quan tâm",
      "Nghe máy, chưa quan tâm",
      "Hẹn gọi lại",
      "Không nghe máy",
      "Thuê bao, sai số",
      "Đã gọi qua Zalo, quan tâm",
      "Đã gọi qua Zalo, không trả lời",
    ]),
  },
  lost: {
    title: "Lý do thất bại",
    items: items("lost", [
      "Giá cao",
      "Đã mua nơi khác",
      "Chưa tin mua từ xa",
      "Người nhận không muốn nhận",
      "Không giao được tới khu vực",
      "Hết nhu cầu, chỉ hỏi giá",
      "Không liên lạc được sau 5 lần",
      "Sai số, số ảo",
      "Trùng lead",
    ]),
  },
  budgets: {
    title: "Ngân sách",
    items: items("bud", ["Dưới 30tr", "30–50tr", "50–80tr", "Trên 80tr", "Chưa rõ"]),
  },
};

// ---------------------------------------------------------------------------
// Việc cần làm
// ---------------------------------------------------------------------------

export type TaskType =
  | "first_contact"
  | "callback"
  | "post_delivery_call"
  | "consumable_reminder"
  | "occasion_reminder"
  | "reactivation"
  | "delivery_step"
  | "warranty_followup"
  | "data_fix";

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  first_contact: "Liên hệ đầu tiên",
  callback: "Hẹn gọi lại",
  post_delivery_call: "Gọi hỏi thăm sau giao",
  consumable_reminder: "Nhắc thay lõi",
  occasion_reminder: "Nhắc dịp tặng",
  reactivation: "Làm nóng lại",
  delivery_step: "Bước giao lắp",
  warranty_followup: "Theo dõi bảo hành",
  data_fix: "Sửa dữ liệu",
};

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  oppId?: string;
  /** Đơn hàng liên quan (mã trong `orders`). */
  orderId?: string;
  /** Tên ngắn người nhận việc; rỗng là hàng chung. */
  owner: string;
  /** Phút trong ngày mô phỏng (giờ VN); lớn hơn 1440 là ngày sau. */
  due: number;
  priority: "high" | "normal";
  status: "open" | "done" | "cancelled" | "missed";
  outcome?: string;
  source: "user" | "rule" | "ai";
  ruleKey?: string;
}

const h = (hh: number, mm = 0) => hh * 60 + mm;

export const TASKS_SEED: Task[] = [
  {
    id: "t1",
    type: "first_contact",
    title: "Gọi lead mới Huỳnh Thị Mai (KOC tại Hàn)",
    oppId: "o5",
    owner: "Thảo",
    due: h(9, 17),
    priority: "high",
    status: "open",
    source: "rule",
    ruleKey: "lead_new_sla",
  },
  {
    id: "t2",
    type: "callback",
    title: "Gọi lại Lê Hoàng Phúc, chốt trước 13/10 để kịp 20/10",
    oppId: "o3",
    owner: "Thảo",
    due: h(18, 30),
    priority: "high",
    status: "open",
    source: "user",
  },
  {
    id: "t3",
    type: "callback",
    title: "Gửi phương án thanh toán 2 lần cho Đặng Minh Khoa",
    oppId: "o6",
    owner: "Thảo",
    due: h(18),
    priority: "normal",
    status: "open",
    source: "user",
  },
  {
    id: "t4",
    type: "occasion_reminder",
    title: "Mời anh Nam chuẩn bị quà mừng thọ 70 tuổi của bố",
    oppId: "o4",
    owner: "Thảo",
    due: h(19, 30),
    priority: "normal",
    status: "open",
    source: "rule",
    ruleKey: "occasion_21d",
  },
  {
    id: "t5",
    type: "post_delivery_call",
    title: "Gọi hỏi thăm anh Khoa sau 3 ngày dùng ghế DV-X9",
    orderId: "o-0009",
    owner: "Thảo",
    due: h(10),
    priority: "normal",
    status: "open",
    source: "rule",
    ruleKey: "post_delivery_3d",
  },
  {
    id: "t6",
    type: "consumable_reminder",
    title: "Xác nhận lịch thay lõi 16:00 cho chị Lan",
    orderId: "o-0008",
    owner: "My",
    due: h(15),
    priority: "normal",
    status: "open",
    source: "rule",
    ruleKey: "consumable_cycle",
  },
  {
    id: "t7",
    type: "data_fix",
    title: "Số của lead live TikTok phuong.kr92 thiếu chữ số, cần kiểm tra",
    owner: "Minh",
    due: h(11),
    priority: "normal",
    status: "open",
    source: "rule",
    ruleKey: "phone_invalid",
  },
  {
    id: "t8",
    type: "callback",
    title: "Gửi video bàn giao hộ Trần cho anh Tài làm bằng chứng",
    oppId: "o7",
    owner: "Thảo",
    due: h(17),
    priority: "normal",
    status: "open",
    source: "user",
  },
  {
    id: "t9",
    type: "delivery_step",
    title: "Xin phép chị Hồng liên hệ người nhận ở Hà Tĩnh",
    oppId: "o9",
    owner: "Thảo",
    due: h(20),
    priority: "high",
    status: "open",
    source: "rule",
    ruleKey: "confirm_recipient",
  },
];

// ---------------------------------------------------------------------------
// Thị trường, ca, luật sinh việc
// ---------------------------------------------------------------------------

export interface MarketSetting {
  code: string;
  name: string;
  timezone: string;
  offsetHours: number;
  weekday: [string, string];
  weekend: [string, string];
  channels: string[];
  active: boolean;
}

export const MARKETS_SEED: MarketSetting[] = [
  {
    code: "VN",
    name: "Việt Nam",
    timezone: "Asia/Ho_Chi_Minh",
    offsetHours: 0,
    weekday: ["08:30", "20:30"],
    weekend: ["09:00", "17:00"],
    channels: ["Gọi điện", "Zalo OA", "ZNS", "SMS"],
    active: true,
  },
  {
    code: "KR",
    name: "Hàn Quốc",
    timezone: "Asia/Seoul",
    offsetHours: 2,
    weekday: ["19:00", "22:30"],
    weekend: ["09:00", "22:30"],
    channels: ["Gọi điện", "Zalo OA"],
    active: true,
  },
];

export interface Shift {
  id: string;
  name: string;
  days: string;
  start: string;
  end: string;
  members: string[];
}

export const SHIFTS_SEED: Shift[] = [
  {
    id: "s1",
    name: "Ca ngày",
    days: "Thứ Hai – Thứ Bảy",
    start: "08:30",
    end: "17:30",
    members: ["Thảo", "An"],
  },
  { id: "s2", name: "Ca tối", days: "Thứ Hai – Thứ Bảy", start: "16:30", end: "21:00", members: ["Thảo"] },
  { id: "s3", name: "Ca Chủ nhật", days: "Chủ nhật", start: "09:00", end: "17:00", members: ["An"] },
];

export interface TaskRule {
  key: string;
  label: string;
  trigger: string;
  due: string;
  assignee: string;
  active: boolean;
}

export const TASK_RULES_SEED: TaskRule[] = [
  {
    key: "lead_new_sla",
    label: "Lead mới: gọi trong SLA",
    trigger: "Lead được giao",
    due: "5 phút",
    assignee: "Người giữ lead",
    active: true,
  },
  {
    key: "confirm_recipient",
    label: "Khách mới: xác nhận người nhận, lịch giao",
    trigger: "Đơn đã cọc",
    due: "1 ngày",
    assignee: "Người bán trên đơn",
    active: true,
  },
  {
    key: "post_delivery_3d",
    label: "Gọi hỏi thăm sau giao",
    trigger: "Đơn hoàn tất",
    due: "3 ngày",
    assignee: "Người bán trên đơn",
    active: true,
  },
  {
    key: "consumable_cycle",
    label: "Nhắc thay lõi theo chu kỳ",
    trigger: "Đơn có máy lọc hoàn tất",
    due: "Theo chu kỳ lõi",
    assignee: "Hàng chung",
    active: true,
  },
  {
    key: "occasion_21d",
    label: "Nhắc dịp tặng",
    trigger: "Ngày quan trọng trong hồ sơ",
    due: "21 ngày trước",
    assignee: "Người giữ khách",
    active: true,
  },
  {
    key: "dormant_90d",
    label: "Làm nóng khách ngủ đông",
    trigger: "90 ngày không tương tác",
    due: "Ngay",
    assignee: "Hàng chung",
    active: false,
  },
  {
    key: "phone_invalid",
    label: "Kiểm tra số không hợp lệ",
    trigger: "Lead có cờ phone_invalid",
    due: "2 giờ",
    assignee: "Sale admin",
    active: true,
  },
];
