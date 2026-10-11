// Nhóm trao đổi nội bộ của đội (dữ liệu mô phỏng): nhóm chung, nhóm telesale, nhóm kho và giao lắp, kênh thông
// báo. Tin có thể kèm ảnh, tệp, liên kết, trả lời một tin khác. Không chứa số điện thoại đầy đủ của khách.

export interface ChatAttachment {
  kind: "image" | "file";
  name: string;
  /** Kích thước hiển thị, ví dụ "1,2 MB". */
  size: string;
  /** Ảnh: đường dẫn hiển thị (ảnh mẫu là SVG nhúng; ảnh tải lên là URL tạm trong trình duyệt). */
  url?: string;
}

export interface ChatMessage {
  id: string;
  /** Tên gọi ngắn của người gửi, khớp người dùng của bản demo. */
  from: string;
  text: string;
  /** "Hôm qua" hoặc "Hôm nay", để chia mốc ngày như Telegram. */
  day: string;
  time: string;
  replyTo?: string;
  attachment?: ChatAttachment;
  likes?: string[];
}

/** Một chủ đề trong nhóm (như chủ đề của nhóm Telegram dạng diễn đàn): đoạn chat riêng, tin ghim riêng. */
export interface ChatTopic {
  id: string;
  name: string;
  color: string;
  createdBy: string;
  pinned?: string;
  messages: ChatMessage[];
}

export interface TeamChat {
  id: string;
  name: string;
  kind: "group" | "channel";
  /** Thành viên theo tên gọi ngắn. */
  members: string[];
  /** Quản trị nhóm: ghim tin; kênh thông báo thì chỉ những người này đăng tin. */
  admins: string[];
  color: string;
  /** Nhóm luôn có ít nhất chủ đề "Chung"; kênh chỉ có một luồng tin. */
  topics: ChatTopic[];
}

/** Màu biểu tượng chủ đề mới, xoay vòng như Telegram. */
export const TOPIC_COLORS = ["#6fb9f0", "#ffd67e", "#cb86db", "#8eee98", "#ff93b2", "#fb6f5f"];

/** Màu tên, ảnh đại diện từng người như Telegram: mỗi người một màu cố định. */
export const MEMBER_COLOR: Record<string, string> = {
  Hà: "#e17076",
  Minh: "#7bc862",
  Thảo: "#6ec9cb",
  An: "#faa774",
  Phương: "#a695e7",
  Linh: "#ee7aae",
};

const ALL = ["Hà", "Minh", "Thảo", "An", "Phương", "Linh"];

/** Ảnh mẫu nhúng (SVG), không tải từ ngoài. */
function sample(label: string, a: string, b: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="480" height="320" fill="url(#g)"/><rect x="150" y="110" width="180" height="120" rx="18" fill="rgba(255,255,255,.35)"/><rect x="180" y="80" width="120" height="60" rx="14" fill="rgba(255,255,255,.5)"/><text x="240" y="285" font-family="sans-serif" font-size="22" fill="#fff" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const TEAM_CHATS: TeamChat[] = [
  {
    id: "c-all",
    name: "Cả đội Showroom Q4",
    kind: "group",
    members: ALL,
    admins: ["Hà", "Minh"],
    color: "#3fb6d1",
    topics: [
      {
        id: "general",
        name: "Chung",
        color: "#6fb9f0",
        createdBy: "Hà",
        messages: [
          {
            id: "m1",
            from: "Hà",
            day: "Hôm qua",
            time: "08:05",
            text: "Chào cả nhà, tuần này tập trung chiến dịch quà 20/10. Mục tiêu 12 đơn cọc.",
          },
          {
            id: "m2",
            from: "Thảo",
            day: "Hôm qua",
            time: "08:12",
            text: "Dạ em nhận ạ. Lead Hàn tối nay em ưu tiên gọi khung 19:00–22:30 giờ Hàn.",
            likes: ["Hà"],
          },
        ],
      },
      {
        id: "campaign-2010",
        name: "Chiến dịch 20/10",
        color: "#ff93b2",
        createdBy: "Minh",
        pinned: "m3",
        messages: [
          {
            id: "m3",
            from: "Minh",
            day: "Hôm qua",
            time: "09:30",
            text: "Chính sách quà 20/10: đặt trước 13/10 tặng gối massage cổ và miễn phí lắp. Bảng giá mới em gửi kèm.",
            attachment: { kind: "file", name: "Bang-gia-thang-10.pdf", size: "412 KB" },
          },
          {
            id: "m4",
            from: "Linh",
            day: "Hôm nay",
            time: "08:40",
            text: "Ghế DV-X9 trưng bày mới về, mọi người xem ảnh nhé.",
            attachment: {
              kind: "image",
              name: "ghe-dv-x9-trung-bay.jpg",
              size: "1,8 MB",
              url: sample("Ghế DV-X9 trưng bày", "#8fb8de", "#4f7fb8"),
            },
            likes: ["Thảo", "An", "Hà"],
          },
          {
            id: "m5",
            from: "An",
            day: "Hôm nay",
            time: "09:02",
            text: "Video khách thật cùng tỉnh để gửi khách Hàn: https://www.youtube.com/watch?v=daiviet-q4",
          },
          {
            id: "m6",
            from: "Hà",
            day: "Hôm nay",
            time: "09:10",
            replyTo: "m5",
            text: "Hay, @Thảo dùng video này cho chị Thu tối nay nhé.",
          },
        ],
      },
    ],
  },
  {
    id: "c-tele",
    name: "Telesale",
    kind: "group",
    members: ["Hà", "Minh", "Thảo", "An", "Phương"],
    admins: ["Minh"],
    color: "#7bc862",
    topics: [
      {
        id: "general",
        name: "Chung",
        color: "#6fb9f0",
        createdBy: "Minh",
        messages: [
          {
            id: "t1",
            from: "Minh",
            day: "Hôm qua",
            time: "17:20",
            text: "Kịch bản mới: hẹn video call trong 48 giờ đầu, chưa gửi giá trước.",
          },
          {
            id: "t2",
            from: "Phương",
            day: "Hôm qua",
            time: "17:45",
            replyTo: "t1",
            text: "Anh ơi lead không nghe máy 3 lần thì mình chuyển sang nhắn Zalo OA luôn ạ?",
          },
          {
            id: "t3",
            from: "Minh",
            day: "Hôm qua",
            time: "17:50",
            replyTo: "t2",
            text: "Đúng rồi, nhắn qua Zalo OA, không dùng Zalo cá nhân nhé.",
          },
        ],
      },
      {
        id: "korea",
        name: "Lead khách Hàn",
        color: "#8eee98",
        createdBy: "Thảo",
        messages: [
          {
            id: "t4",
            from: "Thảo",
            day: "Hôm nay",
            time: "09:05",
            text: "Đơn #Q4-2610-0012 của anh Tùng đã cọc, em nhờ kho giữ ghế nâu ạ.",
          },
        ],
      },
    ],
  },
  {
    id: "c-kho",
    name: "Kho & giao lắp",
    kind: "group",
    members: ["Hà", "Minh", "Thảo", "Linh"],
    admins: ["Minh"],
    color: "#faa774",
    topics: [
      {
        id: "general",
        name: "Chung",
        color: "#6fb9f0",
        createdBy: "Minh",
        messages: [
          {
            id: "k1",
            from: "Linh",
            day: "Hôm qua",
            time: "15:10",
            text: "Biên bản lắp đặt nhà bác Bảy, Nghệ An.",
            attachment: {
              kind: "image",
              name: "lap-dat-nghe-an.jpg",
              size: "2,4 MB",
              url: sample("Lắp đặt tại Nghệ An", "#9bd18c", "#4f9a5f"),
            },
          },
          {
            id: "k2",
            from: "Minh",
            day: "Hôm nay",
            time: "08:20",
            text: "Phiếu nhập hàng Đại Việt tuần này.",
            attachment: { kind: "file", name: "Phieu-nhap-PN-1006.xlsx", size: "38 KB" },
          },
        ],
      },
    ],
  },
  {
    id: "c-news",
    name: "Thông báo showroom",
    kind: "channel",
    members: ALL,
    admins: ["Hà", "Minh"],
    color: "#e17076",
    topics: [
      {
        id: "general",
        name: "Thông báo",
        color: "#fb6f5f",
        createdBy: "Hà",
        messages: [
          {
            id: "n1",
            from: "Hà",
            day: "Hôm qua",
            time: "07:30",
            text: "Từ thứ Hai, ca tối 16:30–21:00 để phủ khung gọi khách ở Hàn. Lịch ca đã cập nhật trong CRM.",
          },
          {
            id: "n2",
            from: "Hà",
            day: "Hôm nay",
            time: "07:45",
            text: "Nhắc: không gửi số điện thoại khách vào nhóm chat. Cần số thì mở hồ sơ lead trên CRM.",
          },
        ],
      },
    ],
  },
];
