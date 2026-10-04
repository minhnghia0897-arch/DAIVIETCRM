// Dữ liệu mô phỏng cho các phân hệ chưa có bảng database (bán hàng tuần 5–6, nhân sự tuần 7).
// Toàn bộ là dữ liệu giả, cố định để màn hình ổn định giữa các lần tải. Khi có bảng thật,
// thay các hàm trong lib/demo/repo.ts bằng truy vấn Supabase, giao diện giữ nguyên.
// Id nhân sự trùng với người dùng giả trong supabase/seed.sql để lọc "của tôi" chạy đúng khi đăng nhập dev.

export type MarketCode = "VN" | "KR";
export type Lifecycle = "lead" | "new_customer" | "active_owner" | "loyal" | "dormant" | "at_risk";

export interface Staff {
  id: string;
  code: string;
  fullName: string;
  title: string;
  roleKey: "owner" | "sale_admin" | "telesale" | "showroom";
  managerId: string | null;
  joinedAt: string;
  status: "probation" | "active" | "on_leave" | "offboarded";
  skills: string[];
  onDuty: boolean;
}

export const STAFF: Staff[] = [
  {
    id: "11111111-1111-4111-8111-000000000001",
    code: "NV001",
    fullName: "Hà Owner",
    title: "Quản lý showroom",
    roleKey: "owner",
    managerId: null,
    joinedAt: "2024-03-01",
    status: "active",
    skills: ["Ghế massage", "Máy lọc nước"],
    onDuty: false,
  },
  {
    id: "11111111-1111-4111-8111-000000000002",
    code: "NV002",
    fullName: "Minh Sale admin",
    title: "Sale admin",
    roleKey: "sale_admin",
    managerId: "11111111-1111-4111-8111-000000000001",
    joinedAt: "2024-06-15",
    status: "active",
    skills: ["Điều phối", "Kho"],
    onDuty: true,
  },
  {
    id: "11111111-1111-4111-8111-000000000003",
    code: "NV003",
    fullName: "Thảo",
    title: "Telesale",
    roleKey: "telesale",
    managerId: "11111111-1111-4111-8111-000000000002",
    joinedAt: "2025-01-06",
    status: "active",
    skills: ["Khách ở Hàn", "Ghế massage"],
    onDuty: true,
  },
  {
    id: "11111111-1111-4111-8111-000000000004",
    code: "NV004",
    fullName: "An",
    title: "Telesale",
    roleKey: "telesale",
    managerId: "11111111-1111-4111-8111-000000000002",
    joinedAt: "2025-04-21",
    status: "active",
    skills: ["Khách trong nước"],
    onDuty: false,
  },
  {
    id: "11111111-1111-4111-8111-000000000005",
    code: "NV005",
    fullName: "Phương",
    title: "Telesale",
    roleKey: "telesale",
    managerId: "11111111-1111-4111-8111-000000000002",
    joinedAt: "2026-08-04",
    status: "probation",
    skills: ["Nói tiếng Hàn", "Máy lọc nước"],
    onDuty: true,
  },
  {
    id: "11111111-1111-4111-8111-000000000006",
    code: "NV006",
    fullName: "Linh",
    title: "Tiếp khách showroom",
    roleKey: "showroom",
    managerId: "11111111-1111-4111-8111-000000000001",
    joinedAt: "2025-09-10",
    status: "active",
    skills: ["Tư vấn tại chỗ", "Lắp đặt"],
    onDuty: true,
  },
];

// ---------------------------------------------------------------------------
// Sản phẩm, kho
// ---------------------------------------------------------------------------

export interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  warrantyMonths: number;
  deliveryClass: "parcel" | "bulky";
  crewSize: number;
  weightKg: number;
  trackSerial: boolean;
  status: "active" | "inactive";
  description: string;
}

export interface Variant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  price: number;
  onlinePrice: number;
  cost: number;
  lowStock: number;
}

export interface Warehouse {
  id: string;
  name: string;
}

export const WAREHOUSES: Warehouse[] = [
  { id: "wh-q4", name: "Kho showroom Q4" },
  { id: "wh-dv", name: "Kho Đại Việt" },
  { id: "wh-demo", name: "Hàng trưng bày" },
];

export const PRODUCTS: Product[] = [
  {
    id: "p-x9",
    name: "Ghế massage DV-X9",
    category: "Ghế massage",
    brand: "Đại Việt",
    warrantyMonths: 60,
    deliveryClass: "bulky",
    crewSize: 2,
    weightKg: 98,
    trackSerial: true,
    status: "active",
    description: "Ghế cao cấp 4D, con lăn SL, sưởi lưng, túi khí toàn thân.",
  },
  {
    id: "p-s7",
    name: "Ghế massage DV-S7",
    category: "Ghế massage",
    brand: "Đại Việt",
    warrantyMonths: 60,
    deliveryClass: "bulky",
    crewSize: 2,
    weightKg: 86,
    trackSerial: true,
    status: "active",
    description: "Ghế 3D tầm trung, phù hợp quà tặng bố mẹ.",
  },
  {
    id: "p-m5",
    name: "Ghế massage DV-M5",
    category: "Ghế massage",
    brand: "Đại Việt",
    warrantyMonths: 36,
    deliveryClass: "bulky",
    crewSize: 2,
    weightKg: 72,
    trackSerial: true,
    status: "active",
    description: "Ghế gọn cho căn hộ nhỏ, 2D, sưởi chân.",
  },
  {
    id: "p-ion",
    name: "Máy lọc nước ion kiềm DV-I3",
    category: "Máy lọc nước",
    brand: "Đại Việt",
    warrantyMonths: 24,
    deliveryClass: "bulky",
    crewSize: 1,
    weightKg: 12,
    trackSerial: true,
    status: "active",
    description: "Ion kiềm 5 tấm điện cực, lắp dưới bồn rửa.",
  },
  {
    id: "p-ro",
    name: "Máy lọc nước RO DV-R10",
    category: "Máy lọc nước",
    brand: "Đại Việt",
    warrantyMonths: 24,
    deliveryClass: "bulky",
    crewSize: 1,
    weightKg: 18,
    trackSerial: true,
    status: "active",
    description: "RO 10 cấp lọc, tủ đứng.",
  },
  {
    id: "p-core",
    name: "Bộ lõi lọc thay thế",
    category: "Lõi lọc và vật tư",
    brand: "Đại Việt",
    warrantyMonths: 0,
    deliveryClass: "parcel",
    crewSize: 0,
    weightKg: 2,
    trackSerial: false,
    status: "active",
    description: "Bộ 3 lõi thay định kỳ 6 tháng.",
  },
  {
    id: "p-pillow",
    name: "Gối massage cổ",
    category: "Quà tặng kèm",
    brand: "Đại Việt",
    warrantyMonths: 6,
    deliveryClass: "parcel",
    crewSize: 0,
    weightKg: 1,
    trackSerial: false,
    status: "active",
    description: "Gối massage cổ vai gáy, sạc USB.",
  },
  {
    id: "p-foot",
    name: "Máy massage chân DV-F2",
    category: "Phụ kiện",
    brand: "Đại Việt",
    warrantyMonths: 12,
    deliveryClass: "parcel",
    crewSize: 0,
    weightKg: 9,
    trackSerial: true,
    status: "active",
    description: "Massage lòng bàn chân, bắp chân, có nhiệt.",
  },
];

export const VARIANTS: Variant[] = [
  {
    id: "v-x9-br",
    productId: "p-x9",
    sku: "DVX9-NAU",
    name: "Nâu",
    price: 79_900_000,
    onlinePrice: 77_900_000,
    cost: 52_000_000,
    lowStock: 3,
  },
  {
    id: "v-x9-bk",
    productId: "p-x9",
    sku: "DVX9-DEN",
    name: "Đen",
    price: 79_900_000,
    onlinePrice: 77_900_000,
    cost: 52_000_000,
    lowStock: 3,
  },
  {
    id: "v-s7-bk",
    productId: "p-s7",
    sku: "DVS7-DEN",
    name: "Đen",
    price: 49_900_000,
    onlinePrice: 48_500_000,
    cost: 31_500_000,
    lowStock: 3,
  },
  {
    id: "v-s7-be",
    productId: "p-s7",
    sku: "DVS7-KEM",
    name: "Kem",
    price: 49_900_000,
    onlinePrice: 48_500_000,
    cost: 31_500_000,
    lowStock: 2,
  },
  {
    id: "v-m5",
    productId: "p-m5",
    sku: "DVM5-XAM",
    name: "Xám",
    price: 29_900_000,
    onlinePrice: 28_900_000,
    cost: 18_200_000,
    lowStock: 2,
  },
  {
    id: "v-ion",
    productId: "p-ion",
    sku: "DVI3",
    name: "Tiêu chuẩn",
    price: 16_900_000,
    onlinePrice: 16_500_000,
    cost: 9_800_000,
    lowStock: 4,
  },
  {
    id: "v-ro",
    productId: "p-ro",
    sku: "DVR10",
    name: "Tiêu chuẩn",
    price: 8_900_000,
    onlinePrice: 8_500_000,
    cost: 5_100_000,
    lowStock: 4,
  },
  {
    id: "v-core",
    productId: "p-core",
    sku: "LOI-3",
    name: "Bộ 3 lõi",
    price: 1_250_000,
    onlinePrice: 1_200_000,
    cost: 520_000,
    lowStock: 15,
  },
  {
    id: "v-pillow",
    productId: "p-pillow",
    sku: "GOI-CO",
    name: "Tiêu chuẩn",
    price: 690_000,
    onlinePrice: 650_000,
    cost: 210_000,
    lowStock: 10,
  },
  {
    id: "v-foot",
    productId: "p-foot",
    sku: "DVF2",
    name: "Tiêu chuẩn",
    price: 6_900_000,
    onlinePrice: 6_500_000,
    cost: 3_900_000,
    lowStock: 3,
  },
];

// [variantId, warehouseId, onHand, reserved]
export const STOCK: [string, string, number, number][] = [
  ["v-x9-br", "wh-q4", 6, 4],
  ["v-x9-br", "wh-dv", 12, 0],
  ["v-x9-br", "wh-demo", 1, 0],
  ["v-x9-bk", "wh-q4", 2, 2],
  ["v-x9-bk", "wh-dv", 8, 0],
  ["v-s7-bk", "wh-q4", 9, 2],
  ["v-s7-bk", "wh-dv", 15, 0],
  ["v-s7-bk", "wh-demo", 1, 0],
  ["v-s7-be", "wh-q4", 1, 1],
  ["v-s7-be", "wh-dv", 4, 0],
  ["v-m5", "wh-q4", 5, 1],
  ["v-m5", "wh-dv", 10, 0],
  ["v-ion", "wh-q4", 7, 1],
  ["v-ion", "wh-dv", 20, 0],
  ["v-ion", "wh-demo", 1, 0],
  ["v-ro", "wh-q4", 3, 0],
  ["v-ro", "wh-dv", 14, 0],
  ["v-core", "wh-q4", 42, 3],
  ["v-pillow", "wh-q4", 8, 3],
  ["v-foot", "wh-q4", 0, 0],
  ["v-foot", "wh-dv", 6, 0],
];

// ---------------------------------------------------------------------------
// Khách, hộ
// ---------------------------------------------------------------------------

export interface Customer {
  id: string;
  fullName: string;
  market: MarketCode;
  city: string;
  province: string;
  phoneMasked: string;
  householdId: string | null;
  relation: string | null;
  lifecycle: Lifecycle;
  ownerId: string;
  source: string;
  lastInteraction: string;
  consents: { channel: string; label: string; granted: boolean }[];
  importantDates: { label: string; date: string }[];
  note: string;
}

export interface Household {
  id: string;
  name: string;
  place: string;
}

export const HOUSEHOLDS: Household[] = [
  { id: "h-nguyen", name: "Hộ Nguyễn", place: "Diễn Châu, Nghệ An" },
  { id: "h-tran", name: "Hộ Trần", place: "Cần Giuộc, Long An" },
  { id: "h-pham", name: "Hộ Phạm", place: "Quận 4, TP.HCM" },
  { id: "h-vo", name: "Hộ Võ", place: "Dĩ An, Bình Dương" },
  { id: "h-le", name: "Hộ Lê", place: "Cao Lãnh, Đồng Tháp" },
  { id: "h-dang", name: "Hộ Đặng", place: "Hải Hậu, Nam Định" },
];

const STD_CONSENT = [
  { channel: "call", label: "Được gọi", granted: true },
  { channel: "zalo_oa", label: "Được nhắn Zalo", granted: true },
  { channel: "marketing", label: "Nhận khuyến mãi", granted: true },
];
const NO_MKT = [
  { channel: "call", label: "Được gọi", granted: true },
  { channel: "zalo_oa", label: "Được nhắn Zalo", granted: true },
  { channel: "marketing", label: "Không nhận khuyến mãi", granted: false },
];

const T = "11111111-1111-4111-8111-000000000003";
const A = "11111111-1111-4111-8111-000000000004";
const P = "11111111-1111-4111-8111-000000000005";
const L = "11111111-1111-4111-8111-000000000006";

export const CUSTOMERS: Customer[] = [
  {
    id: "c-thu",
    fullName: "Nguyễn Thị Thu",
    market: "KR",
    city: "Daegu",
    province: "",
    phoneMasked: "+82 10••••2290",
    householdId: "h-nguyen",
    relation: "Con gái",
    lifecycle: "new_customer",
    ownerId: T,
    source: "Facebook Ads nhắm người Việt tại Hàn",
    lastInteraction: "2026-10-03T13:10:00+07:00",
    consents: STD_CONSENT,
    importantDates: [{ label: "Mừng thọ 70 bố", date: "2026-11-12" }],
    note: "Muốn giao trước 20/10, giữ bất ngờ với bố mẹ.",
  },
  {
    id: "c-luc",
    fullName: "Nguyễn Văn Lực",
    market: "VN",
    city: "Diễn Châu",
    province: "Nghệ An",
    phoneMasked: "Chưa có số",
    householdId: "h-nguyen",
    relation: "Bố, 69 tuổi",
    lifecycle: "lead",
    ownerId: T,
    source: "Người đặt cung cấp",
    lastInteraction: "2026-10-03T13:10:00+07:00",
    consents: [],
    importantDates: [{ label: "Sinh nhật", date: "1957-11-12" }],
    note: "",
  },
  {
    id: "c-nam",
    fullName: "Trần Văn Nam",
    market: "KR",
    city: "Ansan",
    province: "",
    phoneMasked: "+82 10••••4471",
    householdId: "h-tran",
    relation: "Con trai",
    lifecycle: "active_owner",
    ownerId: T,
    source: "Facebook Ads nhắm người Việt tại Hàn",
    lastInteraction: "2026-09-28T19:40:00+07:00",
    consents: STD_CONSENT,
    importantDates: [{ label: "Sinh nhật mẹ", date: "1962-02-18" }],
    note: "Đã mua DV-S7 cho bố mẹ, hài lòng. Có thể mua máy lọc nước.",
  },
  {
    id: "c-bay",
    fullName: "Trần Văn Bảy",
    market: "VN",
    city: "Cần Giuộc",
    province: "Long An",
    phoneMasked: "090•••215",
    householdId: "h-tran",
    relation: "Bố, 69 tuổi",
    lifecycle: "active_owner",
    ownerId: T,
    source: "Người đặt cung cấp",
    lastInteraction: "2026-09-20T10:00:00+07:00",
    consents: [{ channel: "call", label: "Được gọi chăm sóc đơn", granted: true }],
    importantDates: [],
    note: "Người dùng ghế, hay ở nhà buổi sáng.",
  },
  {
    id: "c-lan",
    fullName: "Phạm Ngọc Lan",
    market: "VN",
    city: "Quận 4",
    province: "TP.HCM",
    phoneMasked: "091•••630",
    householdId: "h-pham",
    relation: "Chủ hộ",
    lifecycle: "loyal",
    ownerId: A,
    source: "Khách đến showroom",
    lastInteraction: "2026-09-14T15:00:00+07:00",
    consents: STD_CONSENT,
    importantDates: [{ label: "Sinh nhật bố", date: "1954-03-05" }],
    note: "Mua máy lọc 04/2026, đang cân nhắc ghế cho bố.",
  },
  {
    id: "c-duc",
    fullName: "Phạm Minh Đức",
    market: "KR",
    city: "Seoul",
    province: "",
    phoneMasked: "+82 10••••8812",
    householdId: "h-pham",
    relation: "Em trai",
    lifecycle: "lead",
    ownerId: P,
    source: "Live TikTok",
    lastInteraction: "2026-10-02T20:15:00+07:00",
    consents: NO_MKT,
    importantDates: [],
    note: "Bình luận live: muốn mua ghế cho bố ở Q4.",
  },
  {
    id: "c-tung",
    fullName: "Võ Thanh Tùng",
    market: "KR",
    city: "Gimhae",
    province: "",
    phoneMasked: "+82 10••••7716",
    householdId: "h-vo",
    relation: "Con trai",
    lifecycle: "new_customer",
    ownerId: T,
    source: "Facebook Ads nhắm người Việt tại Hàn",
    lastInteraction: "2026-10-01T19:05:00+07:00",
    consents: STD_CONSENT,
    importantDates: [],
    note: "Đã cọc DV-X9, giao Dĩ An.",
  },
  {
    id: "c-hai",
    fullName: "Võ Văn Hai",
    market: "VN",
    city: "Dĩ An",
    province: "Bình Dương",
    phoneMasked: "097•••441",
    householdId: "h-vo",
    relation: "Bố, 66 tuổi",
    lifecycle: "new_customer",
    ownerId: T,
    source: "Người đặt cung cấp",
    lastInteraction: "2026-10-01T19:05:00+07:00",
    consents: [{ channel: "call", label: "Được gọi chăm sóc đơn", granted: true }],
    importantDates: [],
    note: "",
  },
  {
    id: "c-phuc",
    fullName: "Lê Hoàng Phúc",
    market: "KR",
    city: "Incheon",
    province: "",
    phoneMasked: "+82 10••••5103",
    householdId: "h-le",
    relation: "Con trai",
    lifecycle: "dormant",
    ownerId: A,
    source: "Facebook Ads nhắm người Việt tại Hàn",
    lastInteraction: "2026-08-19T20:00:00+07:00",
    consents: STD_CONSENT,
    importantDates: [{ label: "20/10 tặng mẹ", date: "2026-10-20" }],
    note: "Lead cũ 45 ngày im lặng, quan tâm DV-M5 làm quà 20/10.",
  },
  {
    id: "c-khoa",
    fullName: "Đặng Minh Khoa",
    market: "KR",
    city: "Busan",
    province: "",
    phoneMasked: "+82 10••••6620",
    householdId: "h-dang",
    relation: "Con trai",
    lifecycle: "at_risk",
    ownerId: P,
    source: "Zalo OA",
    lastInteraction: "2026-09-30T21:00:00+07:00",
    consents: STD_CONSENT,
    importantDates: [],
    note: "Ghế giao 08/2026 báo lỗi túi khí, đang bảo hành.",
  },
  {
    id: "c-huong",
    fullName: "Chị Hương",
    market: "VN",
    city: "Quận 7",
    province: "TP.HCM",
    phoneMasked: "093•••808",
    householdId: null,
    relation: null,
    lifecycle: "lead",
    ownerId: A,
    source: "Hotline",
    lastInteraction: "2026-10-03T15:00:00+07:00",
    consents: STD_CONSENT,
    importantDates: [],
    note: "Mua cho chính mình, thích DV-S7 màu kem.",
  },
  {
    id: "c-minh",
    fullName: "Bùi Quang Minh",
    market: "VN",
    city: "Thủ Đức",
    province: "TP.HCM",
    phoneMasked: "098•••377",
    householdId: null,
    relation: null,
    lifecycle: "loyal",
    ownerId: L,
    source: "Giới thiệu từ khách cũ",
    lastInteraction: "2026-09-05T11:00:00+07:00",
    consents: STD_CONSENT,
    importantDates: [],
    note: "Đã giới thiệu 2 khách.",
  },
  {
    id: "c-yen",
    fullName: "Lý Hải Yến",
    market: "KR",
    city: "Suwon",
    province: "",
    phoneMasked: "+82 10••••3391",
    householdId: null,
    relation: null,
    lifecycle: "lead",
    ownerId: P,
    source: "Facebook Ads nhắm người Việt tại Hàn",
    lastInteraction: "2026-10-04T09:30:00+07:00",
    consents: STD_CONSENT,
    importantDates: [{ label: "Tết", date: "2027-02-06" }],
    note: "Đặt cho mẹ ở Thái Bình, ngân sách 30–50tr.",
  },
  {
    id: "c-son",
    fullName: "Hồ Văn Sơn",
    market: "VN",
    city: "Biên Hòa",
    province: "Đồng Nai",
    phoneMasked: "094•••512",
    householdId: null,
    relation: null,
    lifecycle: "active_owner",
    ownerId: A,
    source: "Facebook Ads trong nước",
    lastInteraction: "2026-09-22T09:00:00+07:00",
    consents: STD_CONSENT,
    importantDates: [],
    note: "Máy lọc RO, đến hạn thay lõi 11/2026.",
  },
];

// ---------------------------------------------------------------------------
// Đơn hàng
// ---------------------------------------------------------------------------

export type OrderStatus =
  | "draft"
  | "pending_approval"
  | "confirmed"
  | "deposit_paid"
  | "ready_to_ship"
  | "delivering"
  | "installed"
  | "completed"
  | "cancelled";

export interface OrderLine {
  variantId: string;
  qty: number;
  unitPrice: number;
  discount: number;
  isGift: boolean;
  serial?: string;
}

export interface Payment {
  type: "deposit" | "balance" | "refund";
  method: string;
  amount: number;
  reference: string;
  status: "recorded" | "confirmed" | "rejected";
  recordedBy: string;
  at: string;
}

export interface Order {
  id: string;
  code: string;
  buyerId: string;
  recipientId: string;
  address: string;
  isGift: boolean;
  giftMessage: string;
  keepSurprise: boolean;
  channel: string;
  sellerId: string;
  status: OrderStatus;
  createdAt: string;
  deliveryDate: string | null;
  lines: OrderLine[];
  fees: { delivery: number; installation: number };
  policies: string[];
  payments: Payment[];
  holdUntil: string | null;
}

export const ORDERS: Order[] = [
  {
    id: "o-0012",
    code: "Q4-2610-0012",
    buyerId: "c-tung",
    recipientId: "c-hai",
    address: "12 Nguyễn An Ninh, Dĩ An, Bình Dương",
    isGift: true,
    giftMessage: "Chúc bố luôn khỏe. Con Tùng.",
    keepSurprise: false,
    channel: "Facebook",
    sellerId: T,
    status: "deposit_paid",
    createdAt: "2026-10-01T19:30:00+07:00",
    deliveryDate: "2026-10-10",
    lines: [
      { variantId: "v-x9-br", qty: 1, unitPrice: 79_900_000, discount: 0, isGift: false },
      { variantId: "v-pillow", qty: 1, unitPrice: 0, discount: 0, isGift: true },
    ],
    fees: { delivery: 0, installation: 0 },
    policies: ["Quà 20/10: tặng gối massage cổ, miễn phí lắp", "Cọc tối thiểu 10 triệu, giữ hàng 14 ngày"],
    payments: [
      {
        type: "deposit",
        method: "Chuyển khoản",
        amount: 20_000_000,
        reference: "Q4-2610-0012 COC",
        status: "confirmed",
        recordedBy: T,
        at: "2026-10-01T20:05:00+07:00",
      },
    ],
    holdUntil: "2026-10-15",
  },
  {
    id: "o-0011",
    code: "Q4-2610-0011",
    buyerId: "c-thu",
    recipientId: "c-luc",
    address: "Xóm 5, Diễn Kỷ, Diễn Châu, Nghệ An",
    isGift: true,
    giftMessage: "Mừng thọ bố 70. Con Thu.",
    keepSurprise: true,
    channel: "Facebook",
    sellerId: T,
    status: "pending_approval",
    createdAt: "2026-10-03T13:40:00+07:00",
    deliveryDate: null,
    lines: [{ variantId: "v-s7-bk", qty: 1, unitPrice: 49_900_000, discount: 3_493_000, isGift: false }],
    fees: { delivery: 1_500_000, installation: 0 },
    policies: ["Giao tỉnh miền Trung: 1.500.000đ"],
    payments: [],
    holdUntil: null,
  },
  {
    id: "o-0010",
    code: "Q4-2609-0010",
    buyerId: "c-nam",
    recipientId: "c-bay",
    address: "Ấp 3, Long Hậu, Cần Giuộc, Long An",
    isGift: true,
    giftMessage: "",
    keepSurprise: false,
    channel: "Facebook",
    sellerId: T,
    status: "completed",
    createdAt: "2026-09-02T20:00:00+07:00",
    deliveryDate: "2026-09-15",
    lines: [
      {
        variantId: "v-s7-bk",
        qty: 1,
        unitPrice: 49_900_000,
        discount: 0,
        isGift: false,
        serial: "S7-2609-0441",
      },
    ],
    fees: { delivery: 0, installation: 0 },
    policies: ["Nội thành và lân cận: miễn phí giao lắp"],
    payments: [
      {
        type: "deposit",
        method: "Chuyển khoản",
        amount: 10_000_000,
        reference: "Q4-2609-0010 COC",
        status: "confirmed",
        recordedBy: T,
        at: "2026-09-02T20:30:00+07:00",
      },
      {
        type: "balance",
        method: "Chuyển khoản",
        amount: 39_900_000,
        reference: "Q4-2609-0010 TT",
        status: "confirmed",
        recordedBy: T,
        at: "2026-09-12T19:00:00+07:00",
      },
    ],
    holdUntil: null,
  },
  {
    id: "o-0009",
    code: "Q4-2609-0009",
    buyerId: "c-khoa",
    recipientId: "c-khoa",
    address: "Hải Hậu, Nam Định",
    isGift: true,
    giftMessage: "",
    keepSurprise: false,
    channel: "Zalo OA",
    sellerId: P,
    status: "completed",
    createdAt: "2026-08-10T21:00:00+07:00",
    deliveryDate: "2026-08-20",
    lines: [
      {
        variantId: "v-x9-bk",
        qty: 1,
        unitPrice: 79_900_000,
        discount: 2_000_000,
        isGift: false,
        serial: "X9-2608-0102",
      },
    ],
    fees: { delivery: 2_500_000, installation: 0 },
    policies: ["Giao tỉnh miền Bắc: 2.500.000đ"],
    payments: [
      {
        type: "balance",
        method: "Chuyển khoản",
        amount: 80_400_000,
        reference: "Q4-2609-0009",
        status: "confirmed",
        recordedBy: P,
        at: "2026-08-12T20:00:00+07:00",
      },
    ],
    holdUntil: null,
  },
  {
    id: "o-0008",
    code: "Q4-2609-0008",
    buyerId: "c-lan",
    recipientId: "c-lan",
    address: "45 Tôn Đản, Quận 4, TP.HCM",
    isGift: false,
    giftMessage: "",
    keepSurprise: false,
    channel: "Showroom",
    sellerId: L,
    status: "completed",
    createdAt: "2026-04-11T15:00:00+07:00",
    deliveryDate: "2026-04-12",
    lines: [
      {
        variantId: "v-ion",
        qty: 1,
        unitPrice: 16_900_000,
        discount: 0,
        isGift: false,
        serial: "I3-2604-0033",
      },
    ],
    fees: { delivery: 0, installation: 0 },
    policies: [],
    payments: [
      {
        type: "balance",
        method: "Tiền mặt tại showroom",
        amount: 16_900_000,
        reference: "PT-0412",
        status: "confirmed",
        recordedBy: L,
        at: "2026-04-11T15:20:00+07:00",
      },
    ],
    holdUntil: null,
  },
  {
    id: "o-0007",
    code: "Q4-2609-0007",
    buyerId: "c-son",
    recipientId: "c-son",
    address: "Biên Hòa, Đồng Nai",
    isGift: false,
    giftMessage: "",
    keepSurprise: false,
    channel: "Facebook",
    sellerId: A,
    status: "completed",
    createdAt: "2026-05-20T10:00:00+07:00",
    deliveryDate: "2026-05-23",
    lines: [
      {
        variantId: "v-ro",
        qty: 1,
        unitPrice: 8_900_000,
        discount: 0,
        isGift: false,
        serial: "R10-2605-0090",
      },
    ],
    fees: { delivery: 300_000, installation: 0 },
    policies: [],
    payments: [
      {
        type: "balance",
        method: "Thu khi giao",
        amount: 9_200_000,
        reference: "COD-0523",
        status: "confirmed",
        recordedBy: A,
        at: "2026-05-23T16:00:00+07:00",
      },
    ],
    holdUntil: null,
  },
  {
    id: "o-0013",
    code: "Q4-2610-0013",
    buyerId: "c-minh",
    recipientId: "c-minh",
    address: "Thủ Đức, TP.HCM",
    isGift: false,
    giftMessage: "",
    keepSurprise: false,
    channel: "Showroom",
    sellerId: L,
    status: "delivering",
    createdAt: "2026-09-29T11:00:00+07:00",
    deliveryDate: "2026-10-04",
    lines: [
      {
        variantId: "v-foot",
        qty: 1,
        unitPrice: 6_900_000,
        discount: 0,
        isGift: false,
        serial: "F2-2609-0017",
      },
      { variantId: "v-core", qty: 2, unitPrice: 1_250_000, discount: 0, isGift: false },
    ],
    fees: { delivery: 0, installation: 0 },
    policies: ["Khách thân: miễn phí giao"],
    payments: [
      {
        type: "balance",
        method: "Chuyển khoản",
        amount: 9_400_000,
        reference: "Q4-2610-0013",
        status: "recorded",
        recordedBy: L,
        at: "2026-09-29T11:30:00+07:00",
      },
    ],
    holdUntil: null,
  },
  {
    id: "o-0014",
    code: "Q4-2610-0014",
    buyerId: "c-huong",
    recipientId: "c-huong",
    address: "Quận 7, TP.HCM",
    isGift: false,
    giftMessage: "",
    keepSurprise: false,
    channel: "Hotline",
    sellerId: A,
    status: "confirmed",
    createdAt: "2026-10-03T16:00:00+07:00",
    deliveryDate: null,
    lines: [{ variantId: "v-s7-be", qty: 1, unitPrice: 49_900_000, discount: 1_000_000, isGift: false }],
    fees: { delivery: 0, installation: 0 },
    policies: ["Nội thành: miễn phí giao lắp"],
    payments: [],
    holdUntil: null,
  },
];

// ---------------------------------------------------------------------------
// Việc, dòng sự kiện, chỉ số
// ---------------------------------------------------------------------------

export interface DemoTask {
  id: string;
  customerId: string;
  title: string;
  due: string;
  priority: 1 | 2 | 3;
  assigneeId: string;
  source: "user" | "rule";
  action: string;
}

export const TASKS: DemoTask[] = [
  {
    id: "t1",
    customerId: "c-nam",
    title: "Gọi hỏi thăm sau giao, ghế DV-S7",
    due: "2026-10-04",
    priority: 1,
    assigneeId: T,
    source: "rule",
    action: "Gọi",
  },
  {
    id: "t2",
    customerId: "c-nam",
    title: "Mời mua thêm máy lọc nước cho hộ Trần",
    due: "2026-10-10",
    priority: 2,
    assigneeId: T,
    source: "rule",
    action: "Nhắn Zalo",
  },
  {
    id: "t3",
    customerId: "c-son",
    title: "Nhắc thay lõi lọc máy RO",
    due: "2026-11-15",
    priority: 2,
    assigneeId: A,
    source: "rule",
    action: "Nhắn Zalo",
  },
  {
    id: "t4",
    customerId: "c-lan",
    title: "Nhắc thay lõi lọc máy ion kiềm",
    due: "2026-10-09",
    priority: 2,
    assigneeId: A,
    source: "rule",
    action: "Gọi",
  },
  {
    id: "t5",
    customerId: "c-thu",
    title: "Nhắc dịp mừng thọ bố (12/11)",
    due: "2026-10-22",
    priority: 3,
    assigneeId: T,
    source: "rule",
    action: "Hẹn lại",
  },
  {
    id: "t6",
    customerId: "c-phuc",
    title: "Làm nóng lại: quà 20/10 cho mẹ",
    due: "2026-10-04",
    priority: 1,
    assigneeId: A,
    source: "rule",
    action: "Gọi",
  },
  {
    id: "t7",
    customerId: "c-khoa",
    title: "Theo dõi bảo hành túi khí ghế X9",
    due: "2026-10-03",
    priority: 1,
    assigneeId: P,
    source: "rule",
    action: "Gọi",
  },
  {
    id: "t8",
    customerId: "c-tung",
    title: "Xác nhận lịch giao với người nhận",
    due: "2026-10-06",
    priority: 1,
    assigneeId: T,
    source: "rule",
    action: "Gọi",
  },
  {
    id: "t9",
    customerId: "c-minh",
    title: "Mời giới thiệu, tặng voucher thay lõi",
    due: "2026-10-12",
    priority: 3,
    assigneeId: L,
    source: "rule",
    action: "Nhắn Zalo",
  },
];

export interface DemoEvent {
  customerId: string;
  at: string;
  kind: "lead" | "call" | "zalo" | "quote" | "order" | "payment" | "delivery" | "warranty" | "note";
  title: string;
  detail: string;
}

export const EVENTS: DemoEvent[] = [
  {
    customerId: "c-nam",
    at: "2026-09-02T19:10:00+07:00",
    kind: "lead",
    title: "Lead mới từ Facebook Ads",
    detail: "Quan tâm ghế cho bố mẹ ở Long An",
  },
  {
    customerId: "c-nam",
    at: "2026-09-02T19:14:00+07:00",
    kind: "call",
    title: "Gọi điện, nghe máy, quan tâm",
    detail: "Hẹn video call 21:00 giờ Hàn",
  },
  {
    customerId: "c-nam",
    at: "2026-09-02T20:00:00+07:00",
    kind: "quote",
    title: "Gửi báo giá DV-S7",
    detail: "Khách đã xem báo giá 2 lần",
  },
  {
    customerId: "c-nam",
    at: "2026-09-02T20:30:00+07:00",
    kind: "payment",
    title: "Cọc 10.000.000đ",
    detail: "Đã xác nhận tiền về",
  },
  {
    customerId: "c-nam",
    at: "2026-09-15T10:00:00+07:00",
    kind: "delivery",
    title: "Giao và lắp xong",
    detail: "Serial S7-2609-0441, bố mẹ đã dùng thử",
  },
  {
    customerId: "c-nam",
    at: "2026-09-28T19:40:00+07:00",
    kind: "zalo",
    title: "Tin Zalo đến",
    detail: "Hỏi về máy lọc nước cho bố mẹ",
  },
  {
    customerId: "c-thu",
    at: "2026-10-03T12:58:00+07:00",
    kind: "lead",
    title: "Lead mới từ Facebook Ads",
    detail: "Ghế cho bố mừng thọ 70",
  },
  {
    customerId: "c-thu",
    at: "2026-10-03T13:01:00+07:00",
    kind: "call",
    title: "Gọi điện, nghe máy, quan tâm",
    detail: "Đủ 4 thông tin, giữ bất ngờ với bố mẹ",
  },
  {
    customerId: "c-thu",
    at: "2026-10-03T13:40:00+07:00",
    kind: "order",
    title: "Tạo đơn Q4-2610-0011",
    detail: "Giảm 7%, chờ Owner duyệt",
  },
  {
    customerId: "c-tung",
    at: "2026-10-01T19:05:00+07:00",
    kind: "call",
    title: "Gọi điện, chốt DV-X9",
    detail: "Giao Dĩ An trước 10/10",
  },
  {
    customerId: "c-tung",
    at: "2026-10-01T20:05:00+07:00",
    kind: "payment",
    title: "Cọc 20.000.000đ",
    detail: "Đã xác nhận, giữ hàng tới 15/10",
  },
  {
    customerId: "c-khoa",
    at: "2026-08-20T15:00:00+07:00",
    kind: "delivery",
    title: "Giao và lắp xong",
    detail: "Serial X9-2608-0102",
  },
  {
    customerId: "c-khoa",
    at: "2026-09-30T21:00:00+07:00",
    kind: "warranty",
    title: "Mở phiếu bảo hành",
    detail: "Túi khí bắp chân không bơm",
  },
  {
    customerId: "c-lan",
    at: "2026-04-11T15:20:00+07:00",
    kind: "order",
    title: "Mua máy lọc ion kiềm tại showroom",
    detail: "Thanh toán tiền mặt",
  },
  {
    customerId: "c-lan",
    at: "2026-09-14T15:00:00+07:00",
    kind: "note",
    title: "Ghé showroom ngồi thử DV-S7",
    detail: "Đi cùng bố, cân nhắc mua cho bố",
  },
  {
    customerId: "c-phuc",
    at: "2026-08-19T20:00:00+07:00",
    kind: "call",
    title: "Gọi điện, không nghe máy",
    detail: "Lần thứ 3",
  },
];

export interface StaffKpi {
  staffId: string;
  revenueDeposit: number;
  revenueTarget: number;
  orders: number;
  callsPerDay: number;
  callsTarget: number;
  slaRate: number;
  infoRate: number;
  closeRate: number;
  medianFirstContact: string;
  callbackOnTime: number;
  avgDiscount: number;
  alerts: string[];
  dutyHoursWeek: number;
  shiftHoursWeek: number;
}

export const KPIS: StaffKpi[] = [
  {
    staffId: T,
    revenueDeposit: 460_000_000,
    revenueTarget: 500_000_000,
    orders: 8,
    callsPerDay: 41,
    callsTarget: 40,
    slaRate: 0.94,
    infoRate: 0.88,
    closeRate: 0.12,
    medianFirstContact: "2:40",
    callbackOnTime: 0.9,
    avgDiscount: 0.021,
    alerts: [],
    dutyHoursWeek: 38.5,
    shiftHoursWeek: 40,
  },
  {
    staffId: A,
    revenueDeposit: 270_000_000,
    revenueTarget: 500_000_000,
    orders: 5,
    callsPerDay: 28,
    callsTarget: 40,
    slaRate: 0.71,
    infoRate: 0.62,
    closeRate: 0.08,
    medianFirstContact: "6:15",
    callbackOnTime: 0.68,
    avgDiscount: 0.034,
    alerts: ["3 lead đánh thất bại sớm", "Trực trễ 2 lần"],
    dutyHoursWeek: 31,
    shiftHoursWeek: 40,
  },
  {
    staffId: P,
    revenueDeposit: 180_000_000,
    revenueTarget: 300_000_000,
    orders: 3,
    callsPerDay: 36,
    callsTarget: 35,
    slaRate: 0.89,
    infoRate: 0.8,
    closeRate: 0.1,
    medianFirstContact: "3:05",
    callbackOnTime: 0.85,
    avgDiscount: 0.018,
    alerts: ["Xem số nhiều hơn số cuộc gọi ghi nhận"],
    dutyHoursWeek: 36,
    shiftHoursWeek: 36,
  },
];
