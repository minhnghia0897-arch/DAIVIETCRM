// Quản lý KOL, KOC (người có ảnh hưởng, người dùng thật làm nội dung) cho showroom: hồ sơ, kênh, bảng giá, hợp
// đồng, booking, hàng mẫu, bài đã đăng, lead và đơn quy về từng người, chi phí và hoa hồng. Tiền lưu đơn vị đồng.
// Bản demo chạy bằng dữ liệu mô phỏng (lib/koc/data.ts); bảng database chờ duyệt (docs/open-questions.md).

export type CreatorKind = "kol" | "koc" | "affiliate";
export type Platform = "tiktok" | "facebook" | "youtube" | "instagram";
export type PartnerStatus = "prospect" | "negotiating" | "active" | "paused" | "ended";
export type ContentFormat = "short_video" | "livestream" | "post" | "story" | "showroom_visit";
export type AudienceMarket = "VN" | "KR";

export interface SocialChannel {
  platform: Platform;
  handle: string;
  url: string;
  followers: number;
  /** Lượt xem trung bình mỗi video, bài gần đây. */
  avgViews: number;
  /** Tỷ lệ tương tác trung bình, phần trăm (3,2 nghĩa là 3,2%). */
  engagementRate: number;
  updatedAt: string;
}

export interface RateItem {
  format: ContentFormat;
  /** Giá trọn gói một lần, đồng. */
  price: number;
}

export interface Contract {
  code: string;
  startsOn: string;
  endsOn: string;
  /** Hoa hồng trên doanh thu đơn hoàn tất có mã của người này, phần trăm. */
  commissionRate: number;
  /** Không nhận quảng cáo ngành hàng cạnh tranh trong thời hạn; null nếu không có. */
  exclusivity: string | null;
  /** Số tháng showroom được dùng lại nội dung (chạy quảng cáo, đăng lại). */
  usageRightsMonths: number;
  status: "draft" | "signed" | "expired";
  fileName: string | null;
}

export interface Rating {
  content: number;
  punctuality: number;
  results: number;
  note: string;
  by: string;
  at: string;
}

export interface Creator {
  id: string;
  /** Tên hiển thị, nghệ danh trên mạng xã hội. */
  name: string;
  realName: string;
  kind: CreatorKind;
  status: PartnerStatus;
  /** Mã nhân sự phụ trách. */
  ownerId: string;
  /** Khán giả chính của người này ở thị trường nào (người Việt tại Hàn, hay trong nước). */
  audience: AudienceMarket;
  livesIn: string;
  niches: string[];
  channels: SocialChannel[];
  rates: RateItem[];
  contract: Contract | null;
  /** Mã giới thiệu riêng: khách nhắc mã, điền vào form hoặc bấm link có mã thì lead quy về người này. */
  trackingCode: string;
  /** Số đã che; số đầy đủ chỉ hiện cho người có quyền xem số. */
  phoneMasked: string;
  phoneFull: string;
  zalo: boolean;
  /** Công ty, người quản lý (nếu làm qua agency). */
  agency: string | null;
  tags: string[];
  note: string;
  rating: Rating | null;
  createdAt: string;
}

export type BookingStatus =
  | "proposed"
  | "budget_pending"
  | "confirmed"
  | "sample_sent"
  | "script_approved"
  | "posted"
  | "accepted"
  | "paid"
  | "cancelled";

export interface Post {
  url: string;
  platform: Platform;
  postedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface Booking {
  id: string;
  creatorId: string;
  campaign: string;
  products: string[];
  format: ContentFormat;
  /** Thời điểm đăng hoặc lên live đã hẹn (UTC). */
  postAt: string;
  fee: number;
  commissionRate: number;
  status: BookingStatus;
  createdBy: string;
  approvedBy: string | null;
  posts: Post[];
  note: string;
  cancelReason: string | null;
}

export interface Sample {
  id: string;
  creatorId: string;
  bookingId: string | null;
  product: string;
  serial: string | null;
  sentAt: string;
  status: "with_creator" | "returned" | "gifted";
}

/** Lead quy về một KOL, KOC qua mã giới thiệu, link có mã hoặc form ghi nguồn. */
export interface AttributedLead {
  id: string;
  creatorId: string;
  bookingId: string | null;
  /** Tên đã rút gọn để không lộ thông tin khách trên màn đối tác. */
  name: string;
  market: AudienceMarket;
  createdAt: string;
  stage: "new" | "contacted" | "quoted" | "deposit" | "won" | "lost";
  /** Giá trị đơn (đồng) khi đã cọc hoặc hoàn tất. */
  orderValue: number;
}

export interface Payout {
  id: string;
  creatorId: string;
  bookingId: string | null;
  kind: "fee" | "commission";
  amount: number;
  paidAt: string;
  reference: string;
  recordedBy: string;
}

export interface CreatorActivity {
  creatorId: string;
  at: string;
  actor: string;
  text: string;
}

export interface KocData {
  creators: Creator[];
  bookings: Booking[];
  samples: Sample[];
  leads: AttributedLead[];
  payouts: Payout[];
  activity: CreatorActivity[];
}
