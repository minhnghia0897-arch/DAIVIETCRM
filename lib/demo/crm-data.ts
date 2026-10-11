// Dữ liệu mô phỏng cho các màn hình theo bản mẫu (docs/reference/daiviet-crm-q4.html):
// Trang chủ, Cơ hội, Hộ gia đình, Hội thoại, Kênh & nội dung, Báo cáo, Agent.
// Nội dung lấy theo bản mẫu; mã giao diện viết lại bằng React. Toàn bộ là dữ liệu giả.

export type Loc = "KR" | "VN";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  task: string;
  count: number;
}

export const TEAM: TeamMember[] = [
  {
    id: "tele",
    name: "Thảo",
    role: "Telesale",
    task: "Gọi 9 lead mới, ưu tiên khung 19:00–22:30 giờ Hàn",
    count: 9,
  },
  {
    id: "mkt",
    name: "Quân",
    role: "Marketing",
    task: "Duyệt ngân sách chiến dịch quà 20/10 cho mẹ",
    count: 3,
  },
  {
    id: "edit",
    name: "Vy",
    role: "Editor video, hình ảnh",
    task: "Dựng 3 video bàn giao gửi người tặng ở Hàn",
    count: 3,
  },
  {
    id: "host",
    name: "My",
    role: "Tiếp khách showroom, livestream",
    task: "Live 20:00 demo DV-X9; 2 video call với khách Hàn",
    count: 4,
  },
  {
    id: "koc",
    name: "Đạt",
    role: "Booking KOC/KOL, vận hành sàn",
    task: "2 KOC tại Hàn đăng bài thứ Bảy; 4 đơn TikTok Shop",
    count: 6,
  },
  {
    id: "admin",
    name: "Hằng",
    role: "Admin các kênh",
    task: "Kiểm tin agent chuyển người, cập nhật bảng giá kênh",
    count: 2,
  },
];

export type AgentId = "lead" | "tele" | "nurture" | "occasion" | "trust" | "house";

export interface Agent {
  id: AgentId;
  name: string;
  color: string;
  desc: string;
  rules: string[];
}

export const AGENTS: Agent[] = [
  {
    id: "lead",
    name: "Agent Phân lead",
    color: "#0176D3",
    desc: "Chấm điểm lead, nhận diện khách ở Hàn, giao telesale theo giờ Hàn.",
    rules: ["Giao trong 5 phút", "Khách Hàn: gọi 19:00–22:30 giờ Hàn hoặc cuối tuần"],
  },
  {
    id: "tele",
    name: "Agent Trợ lý tele",
    color: "#0B827C",
    desc: "Gợi ý kịch bản, tóm tắt cuộc gọi, ghi người nhận và dịp tặng.",
    rules: ["Không hứa giá ngoài bảng", "Giảm trên 5% cần quản lý showroom duyệt"],
  },
  {
    id: "nurture",
    name: "Agent Nuôi lead",
    color: "#A96404",
    desc: "Làm nóng lead cũ bằng video khách thật cùng tỉnh, cùng hoàn cảnh.",
    rules: ["Tối đa 2 tin mỗi tuần", "Chỉ nhắn khách đã đồng ý"],
  },
  {
    id: "occasion",
    name: "Agent Dịp tặng quà",
    color: "#C23934",
    desc: "Đọc ngày sinh, mừng thọ, 20/10, Tết trong hồ sơ hộ để nhắc người tặng.",
    rules: ["Nhắc trước 14–21 ngày", "Không liên hệ người nhận khi chưa được phép"],
  },
  {
    id: "trust",
    name: "Agent Giao lắp & niềm tin",
    color: "#2E844A",
    desc: "Cập nhật người tặng từng bước, gửi video bàn giao, xin đánh giá.",
    rules: ["Video bàn giao trong 24 giờ", "Xin đánh giá sau 3 ngày sử dụng"],
  },
  {
    id: "house",
    name: "Agent Hộ gia đình",
    color: "#7526E3",
    desc: "Gộp thành viên vào cùng hộ, tìm cơ hội bán chéo trong hệ sinh thái.",
    rules: ["Gộp khi có từ 2 bằng chứng", "Chỉ đề xuất, không tự nhắn"],
  },
];

export const agentById = (id: AgentId) => AGENTS.find((a) => a.id === id)!;

export const KR_NAMES = [
  "Nguyễn Văn Hùng",
  "Phạm Thị Thủy",
  "Đặng Minh Khoa",
  "Huỳnh Thị Mai",
  "Lương Văn Tài",
  "Trương Thị Ngọc",
  "Bùi Đức Anh",
  "Mai Thị Hồng",
];
export const KR_CITIES = ["Ansan", "Daegu", "Incheon", "Gimhae", "Suwon", "Seoul", "Busan", "Hwaseong"];
export const PROVINCES = [
  "Nghệ An",
  "Thanh Hóa",
  "Hà Tĩnh",
  "Hải Dương",
  "Thái Bình",
  "Bắc Giang",
  "Long An",
  "Đồng Tháp",
  "Cần Thơ",
  "Bình Định",
];
export const CHAIRS: [string, number][] = [
  ["Ghế massage DV-X9", 79.9],
  ["Ghế massage DV-S7", 45.9],
  ["Ghế massage DV-M5", 29.9],
];

// ---------------------------------------------------------------------------
// Hộ gia đình
// ---------------------------------------------------------------------------

export interface Member {
  name: string;
  rel: string;
  role: "Người đặt" | "Người dùng" | "Người nhận" | "Người mua" | "Tiềm năng";
  loc: Loc;
  city: string;
  phone: string;
  channels?: string;
}

export interface CrossSell {
  title: string;
  detail: string;
  value: number;
  to: string;
}

export type TimelineKind = "call" | "zalo" | "truck" | "cart" | "flag" | "chat" | "house" | "video";

export interface House {
  id: string;
  name: string;
  place: string;
  value: number;
  engagement: number;
  members: Member[];
  why: string[];
  owned: [string, string, string][];
  cross: CrossSell[];
  trust: string[];
  dates: [string, string][];
  timeline: { date: string; who: string; kind: TimelineKind; title: string; ai: string | null }[];
}

export const HOUSES: House[] = [
  {
    id: "h1",
    name: "Hộ Trần",
    place: "Cần Giuộc, Long An",
    value: 45.9,
    engagement: 86,
    members: [
      {
        name: "Trần Văn Nam",
        rel: "Con trai",
        role: "Người đặt",
        loc: "KR",
        city: "Ansan",
        phone: "+82 10•••4471",
        channels: "Zalo, Facebook",
      },
      {
        name: "Trần Văn Bảy",
        rel: "Bố, 69 tuổi",
        role: "Người dùng",
        loc: "VN",
        city: "Cần Giuộc, Long An",
        phone: "090•••215",
      },
      {
        name: "Lê Thị Sáu",
        rel: "Mẹ, 64 tuổi",
        role: "Người dùng",
        loc: "VN",
        city: "Cần Giuộc, Long An",
        phone: "Dùng chung số bố",
      },
      {
        name: "Trần Thị Hoa",
        rel: "Chị gái",
        role: "Tiềm năng",
        loc: "VN",
        city: "Quận 8, TP.HCM",
        phone: "093•••808",
      },
    ],
    why: [
      "Anh Nam khai người nhận là bố mẹ khi đặt hàng",
      "Trùng địa chỉ giao Cần Giuộc",
      "Chị Hoa đi cùng bố mẹ nhận ghế, để lại số",
    ],
    owned: [["Ghế massage DV-S7", "Giao 15/09/2026", "Bảo hành đến 09/2031"]],
    cross: [
      {
        title: "Máy lọc nước ion kiềm cho bố mẹ",
        detail:
          "Nhà dùng nước giếng khoan. Mẹ hỏi về nước uống trong buổi bàn giao ghế. Anh Nam là người quyết định chi.",
        value: 16.9,
        to: "Trần Văn Nam",
      },
      {
        title: "Quà mừng thọ 70 tuổi của bố, 12/11",
        detail: "Ngày sinh lấy từ phiếu bảo hành. Gợi ý gói mừng thọ kèm thiệp video quay tại showroom.",
        value: 16.9,
        to: "Trần Văn Nam",
      },
      {
        title: "Ghế DV-M5 cho nhà chị Hoa",
        detail: "Chị Hoa ngồi thử ghế của bố mẹ 20 phút và hỏi giá dòng nhỏ hơn.",
        value: 29.9,
        to: "Trần Thị Hoa",
      },
    ],
    trust: [
      "Video bàn giao gửi anh Nam 15/09, anh xem 4 lần",
      "Mẹ đánh giá 5 sao ngay tại nhà",
      "Anh Nam giới thiệu 1 người bạn ở Ansan",
    ],
    dates: [
      ["20/10", "Ngày Phụ nữ Việt Nam, quà cho mẹ"],
      ["12/11", "Bố tròn 70 tuổi"],
      ["Tết 2027", "Dịp tặng quà lớn nhất năm"],
    ],
    timeline: [
      {
        date: "28/09",
        who: "Trần Thị Hoa",
        kind: "call",
        title: "Gọi hỏi giá ghế DV-M5",
        ai: "Tiềm năng mua cho gia đình riêng ở Quận 8",
      },
      {
        date: "18/09",
        who: "Trần Văn Nam",
        kind: "zalo",
        title: "Đánh giá 5 sao, gửi ảnh bố ngồi ghế",
        ai: null,
      },
      {
        date: "15/09",
        who: "Lê Thị Sáu",
        kind: "truck",
        title: "Nhận và lắp ghế DV-S7 tại nhà",
        ai: "Mẹ hỏi máy lọc nước, nhà dùng nước giếng",
      },
      {
        date: "02/09",
        who: "Trần Văn Nam",
        kind: "cart",
        title: "Đặt ghế DV-S7, thanh toán đủ từ Hàn",
        ai: null,
      },
    ],
  },
  {
    id: "h2",
    name: "Hộ Nguyễn",
    place: "Diễn Châu, Nghệ An",
    value: 0,
    engagement: 58,
    members: [
      {
        name: "Nguyễn Thị Thu",
        rel: "Con gái",
        role: "Người đặt",
        loc: "KR",
        city: "Daegu",
        phone: "+82 10•••2290",
        channels: "Zalo",
      },
      {
        name: "Nguyễn Văn Lực",
        rel: "Bố, 61 tuổi",
        role: "Người nhận",
        loc: "VN",
        city: "Diễn Châu, Nghệ An",
        phone: "Chưa có",
      },
      {
        name: "Hồ Thị Lài",
        rel: "Mẹ, 58 tuổi",
        role: "Người nhận",
        loc: "VN",
        city: "Diễn Châu, Nghệ An",
        phone: "Chưa có",
      },
    ],
    why: ["Chị Thu khai người nhận khi hỏi giá giao Nghệ An"],
    owned: [],
    cross: [
      {
        title: "Ghế DV-X9 làm quà Tết cho bố mẹ",
        detail:
          "Đang ở bước báo giá. Rào cản lớn nhất là niềm tin mua từ xa. Nên mời video call xem ghế thật tại showroom.",
        value: 79.9,
        to: "Nguyễn Thị Thu",
      },
    ],
    trust: ["Chưa có giao dịch. Đã xem 3 video bàn giao của khách ở Nghệ An"],
    dates: [["Tết 2027", "Muốn ghế về trước 23 tháng Chạp"]],
    timeline: [
      {
        date: "03/10",
        who: "Nguyễn Thị Thu",
        kind: "zalo",
        title: "Hỏi có lắp tận Nghệ An không, sợ mua online bị lừa",
        ai: "Lo ngại niềm tin. Cần người thật, nên video call",
      },
      {
        date: "30/09",
        who: "Nguyễn Thị Thu",
        kind: "flag",
        title: "Để lại số từ quảng cáo Facebook nhắm người Việt tại Hàn",
        ai: null,
      },
    ],
  },
  {
    id: "h3",
    name: "Hộ Phạm",
    place: "Quận 4, TP.HCM",
    value: 16.9,
    engagement: 72,
    members: [
      {
        name: "Phạm Ngọc Lan",
        rel: "Chủ hộ",
        role: "Người mua",
        loc: "VN",
        city: "Quận 4, TP.HCM",
        phone: "091•••630",
      },
      {
        name: "Phạm Minh Đức",
        rel: "Em trai",
        role: "Tiềm năng",
        loc: "KR",
        city: "Seoul",
        phone: "+82 10•••8812",
        channels: "TikTok, Zalo",
      },
      {
        name: "Phạm Văn Tư",
        rel: "Bố, 72 tuổi",
        role: "Người dùng",
        loc: "VN",
        city: "Quận 4, TP.HCM",
        phone: "Dùng chung số chị Lan",
      },
    ],
    why: ['Anh Đức bình luận live TikTok "mua cho bố ở Q4"', "Chị Lan nhắc em trai ở Seoul khi gọi hotline"],
    owned: [["Máy lọc nước ion kiềm", "Mua tại showroom 04/2026", "Thay lõi tiếp theo 10/2026"]],
    cross: [
      {
        title: "Ghế DV-S7 cho bố, anh Đức tặng từ Seoul",
        detail:
          "Bố 72 tuổi đau lưng, chị Lan đã đưa bố ra showroom ngồi thử 2 lần. Anh Đức là người trả tiền.",
        value: 45.9,
        to: "Phạm Minh Đức",
      },
      {
        title: "Thay lõi lọc định kỳ",
        detail: "Lõi lọc đến hạn thay trong tháng 10.",
        value: 1.2,
        to: "Phạm Ngọc Lan",
      },
    ],
    trust: ["Khách quen showroom, ghé 3 lần", "Đã thay lõi đúng hạn lần trước"],
    dates: [
      ["10/2026", "Đến hạn thay lõi lọc"],
      ["Tết 2027", "Anh Đức về Việt Nam ăn Tết"],
    ],
    timeline: [
      {
        date: "01/10",
        who: "Phạm Minh Đức",
        kind: "chat",
        title: "Bình luận live TikTok: hỏi ghế cho bố ở Q4",
        ai: "Agent Hộ gia đình gộp vào hộ Phạm",
      },
      {
        date: "26/09",
        who: "Phạm Ngọc Lan",
        kind: "call",
        title: "Gọi hotline hỏi lịch thay lõi",
        ai: "Nhắc em trai ở Seoul muốn mua ghế cho bố",
      },
      {
        date: "14/09",
        who: "Phạm Văn Tư",
        kind: "house",
        title: "Ghé showroom ngồi thử DV-S7 cùng chị Lan",
        ai: null,
      },
    ],
  },
  {
    id: "h4",
    name: "Hộ Lê",
    place: "Cao Lãnh, Đồng Tháp",
    value: 0,
    engagement: 31,
    members: [
      {
        name: "Lê Hoàng Phúc",
        rel: "Con trai",
        role: "Người đặt",
        loc: "KR",
        city: "Incheon",
        phone: "+82 10•••5103",
        channels: "Facebook",
      },
      {
        name: "Ngô Thị Út",
        rel: "Mẹ, 60 tuổi",
        role: "Người nhận",
        loc: "VN",
        city: "Cao Lãnh, Đồng Tháp",
        phone: "Chưa có",
      },
    ],
    why: ["Anh Phúc khai người nhận là mẹ"],
    owned: [],
    cross: [
      {
        title: "Ghế DV-M5 làm quà 20/10 cho mẹ",
        detail: "Lead cũ 45 ngày im lặng. Vừa mở tin nhắc 20/10 và hỏi còn ưu đãi không.",
        value: 29.9,
        to: "Lê Hoàng Phúc",
      },
    ],
    trust: ["Chưa có giao dịch"],
    dates: [["20/10", "Quà cho mẹ"]],
    timeline: [
      {
        date: "04/10",
        who: "Lê Hoàng Phúc",
        kind: "zalo",
        title: "Hỏi còn ưu đãi 20/10 cho mẹ không",
        ai: "Lead nguội vừa nóng lại nhờ tin nhắc dịp lễ",
      },
      {
        date: "20/08",
        who: "Lê Hoàng Phúc",
        kind: "flag",
        title: "Để lại số từ quảng cáo, sau đó không nghe máy",
        ai: null,
      },
    ],
  },
  {
    id: "h5",
    name: "Hộ Võ",
    place: "Dĩ An, Bình Dương",
    value: 79.9,
    engagement: 77,
    members: [
      {
        name: "Võ Thanh Tùng",
        rel: "Con trai",
        role: "Người đặt",
        loc: "KR",
        city: "Gimhae",
        phone: "+82 10•••7716",
        channels: "Facebook, Zalo",
      },
      {
        name: "Võ Văn Hai",
        rel: "Bố, 66 tuổi",
        role: "Người nhận",
        loc: "VN",
        city: "Dĩ An, Bình Dương",
        phone: "097•••441",
      },
    ],
    why: ["Anh Tùng khai người nhận là bố", "Số người nhận đã xác nhận qua cuộc gọi"],
    owned: [["Ghế massage DV-X9", "Đang giao, hẹn 10/10", "Bảo hành 5 năm sau lắp"]],
    cross: [
      {
        title: "Máy lọc không khí cho phòng bố",
        detail: "Bố ở gần khu công nghiệp, anh Tùng hỏi về bụi mịn khi tư vấn ghế.",
        value: 8.9,
        to: "Võ Thanh Tùng",
      },
    ],
    trust: ["Đã cọc 20tr, xem video showroom trước khi cọc"],
    dates: [["10/10", "Hẹn giao và lắp ghế"]],
    timeline: [
      { date: "02/10", who: "Võ Thanh Tùng", kind: "cart", title: "Thanh toán đủ DV-X9 từ Hàn", ai: null },
      {
        date: "25/09",
        who: "Võ Thanh Tùng",
        kind: "video",
        title: "Video call xem ghế với My tại showroom 25 phút",
        ai: "Sau video call, khách cọc ngay trong ngày",
      },
    ],
  },
];

export const houseById = (id: string) => HOUSES.find((h) => h.id === id);

// ---------------------------------------------------------------------------
// Cơ hội
// ---------------------------------------------------------------------------

export const STAGES = ["Lead mới", "Đã liên hệ", "Demo, video call", "Báo giá", "Đặt cọc", "Giao & lắp"];

export interface Opportunity {
  id: string;
  name: string;
  city: string;
  to: string;
  product: string;
  value: number;
  stage: number;
  source: string;
  owner: string;
  score: number;
  occasion: string;
  houseId?: string;
  next: string;
}

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "o1",
    name: "Nguyễn Thị Thu",
    city: "Daegu",
    to: "Nghệ An",
    product: "Ghế massage DV-X9",
    value: 79.9,
    stage: 1,
    source: "Facebook Ads Hàn",
    owner: "Thảo",
    score: 64,
    occasion: "Tết 2027",
    houseId: "h2",
    next: "Mời video call xem ghế thật lúc 21:00 giờ Hàn. Khách lo niềm tin, chưa lo giá.",
  },
  {
    id: "o2",
    name: "Phạm Minh Đức",
    city: "Seoul",
    to: "Quận 4",
    product: "Ghế massage DV-S7",
    value: 45.9,
    stage: 2,
    source: "Live TikTok",
    owner: "My",
    score: 82,
    occasion: "Tặng bố",
    houseId: "h3",
    next: "Bố đã ngồi thử 2 lần. Gửi anh Đức video bố ngồi ghế tại showroom, chốt lịch giao trước khi anh về Tết.",
  },
  {
    id: "o3",
    name: "Lê Hoàng Phúc",
    city: "Incheon",
    to: "Đồng Tháp",
    product: "Ghế massage DV-M5",
    value: 29.9,
    stage: 1,
    source: "Lead cũ làm nóng",
    owner: "Thảo",
    score: 57,
    occasion: "20/10",
    houseId: "h4",
    next: "Gọi lại tối nay. Nhấn hạn giao trước 20/10 phải chốt trước 13/10.",
  },
  {
    id: "o4",
    name: "Trần Văn Nam",
    city: "Ansan",
    to: "Long An",
    product: "Máy lọc nước ion kiềm",
    value: 16.9,
    stage: 0,
    source: "Bán chéo hộ gia đình",
    owner: "Thảo",
    score: 71,
    occasion: "Mừng thọ bố",
    houseId: "h1",
    next: "Khách cũ hài lòng. Mở lời bằng mừng thọ 70 tuổi của bố, không cần ưu đãi.",
  },
  {
    id: "o5",
    name: "Huỳnh Thị Mai",
    city: "Suwon",
    to: "Thanh Hóa",
    product: "Ghế massage DV-S7",
    value: 45.9,
    stage: 0,
    source: "KOC tại Hàn",
    owner: "Thảo",
    score: 49,
    occasion: "Tết 2027",
    next: "Lead mới 12 phút trước. Gọi ngay, đang 20:41 giờ Hàn.",
  },
  {
    id: "o6",
    name: "Đặng Minh Khoa",
    city: "Busan",
    to: "Hải Dương",
    product: "Ghế massage DV-X9",
    value: 79.9,
    stage: 1,
    source: "Facebook Ads Hàn",
    owner: "Thảo",
    score: 44,
    occasion: "Sinh nhật mẹ",
    next: "Khách hỏi trả góp. Gửi phương án thanh toán 2 lần từ Hàn.",
  },
  {
    id: "o7",
    name: "Lương Văn Tài",
    city: "Hwaseong",
    to: "Bắc Giang",
    product: "Ghế massage DV-S7",
    value: 45.9,
    stage: 3,
    source: "Giới thiệu",
    owner: "Thảo",
    score: 76,
    occasion: "Tết 2027",
    next: "Bạn của anh Nam giới thiệu. Gửi video bàn giao hộ Trần làm bằng chứng.",
  },
  {
    id: "o8",
    name: "Chị Hương (walk-in)",
    city: "",
    to: "Quận 7",
    product: "Ghế massage DV-M5",
    value: 29.9,
    stage: 2,
    source: "Khách đến showroom",
    owner: "My",
    score: 61,
    occasion: "",
    next: "Khách ngồi thử 15 phút. Hẹn quay lại cùng chồng cuối tuần.",
  },
  {
    id: "o9",
    name: "Mai Thị Hồng",
    city: "Gimhae",
    to: "Hà Tĩnh",
    product: "Ghế massage DV-X9",
    value: 79.9,
    stage: 4,
    source: "Live TikTok",
    owner: "Thảo",
    score: 91,
    occasion: "Tết 2027",
    next: "Đã cọc 20tr. Xác nhận người nhận và hẹn giao.",
  },
  {
    id: "o10",
    name: "Võ Thanh Tùng",
    city: "Gimhae",
    to: "Bình Dương",
    product: "Ghế massage DV-X9",
    value: 79.9,
    stage: 5,
    source: "Facebook Ads Hàn",
    owner: "My",
    score: 96,
    occasion: "Tặng bố",
    houseId: "h5",
    next: "Giao 10/10. Agent sẽ gửi video bàn giao cho anh Tùng trong 24 giờ.",
  },
];

// ---------------------------------------------------------------------------
// Hội thoại
// ---------------------------------------------------------------------------

export type ConvStatus = "need" | "agent" | "human" | "done";
export type MsgFrom = "cu" | "ag" | "hu" | "sys";

export interface Conversation {
  id: string;
  name: string;
  houseId?: string;
  channel: "Zalo" | "Facebook" | "TikTok Live" | "Hotline";
  location: string;
  status: ConvStatus;
  worried: boolean;
  time: string;
  intent: string;
  summary: string;
  messages: [MsgFrom, string, string][];
  suggestions: string[];
  /** Nhân viên phụ trách hội thoại (tên gọi ngắn); trống là chưa giao. */
  assignee?: string;
  /** Thẻ gắn cho khách trong hội thoại (nhãn trong CONV_TAGS hoặc thẻ tự tạo). */
  tags: string[];
  /** Khi nhân viên trả lời, khách phản hồi lại câu này (mô phỏng), cơ hội chuyển bước. */
  followUp?: string;
  moveOpportunity?: string;
}

export const CHANNEL_COLOR: Record<Conversation["channel"], string> = {
  Zalo: "#0068FF",
  Facebook: "#1877F2",
  "TikTok Live": "#111111",
  Hotline: "#3BA755",
};

export const CONV_STATUS: Record<ConvStatus, { label: string; tone: "err" | "ai" | "warn" | "ok" }> = {
  need: { label: "Cần người", tone: "err" },
  agent: { label: "Agent đang xử lý", tone: "ai" },
  human: { label: "Người đang xử lý", tone: "warn" },
  done: { label: "Đã xong", tone: "ok" },
};

/** Thẻ mặc định cho hội thoại, kiểu Pancake. Nhân viên tạo thêm thẻ ngay trên màn Hội thoại. */
export const CONV_TAGS: { label: string; color: string }[] = [
  { label: "Khách Hàn", color: "#2a7bd4" },
  { label: "Quan tâm ghế", color: "#7c4dff" },
  { label: "Quan tâm máy lọc", color: "#00897b" },
  { label: "Hỏi giá", color: "#ef6c00" },
  { label: "Lo ngại uy tín", color: "#e53935" },
  { label: "Khách cũ", color: "#6d4c41" },
  { label: "Đã chốt", color: "#43a047" },
  { label: "Ưu đãi 20/10", color: "#d81b60" },
];

export const CONVERSATIONS: Conversation[] = [
  {
    id: "v1",
    assignee: "Thảo",
    tags: ["Khách Hàn", "Quan tâm ghế", "Lo ngại uy tín"],
    name: "Nguyễn Thị Thu",
    houseId: "h2",
    channel: "Zalo",
    location: "Daegu",
    status: "need",
    worried: true,
    time: "10:04",
    intent: "Mua ghế làm quà Tết cho bố mẹ, cần chắc chắn không bị lừa",
    summary:
      "Chị Thu ở Daegu muốn tặng bố mẹ ở Nghệ An ghế DV-X9 dịp Tết. Agent đã trả lời về giao và lắp tận nhà, nhưng chị muốn nhìn ghế thật và nói chuyện với người.",
    messages: [
      ["cu", "Bên mình có giao lắp tận Diễn Châu, Nghệ An không em?", "09:58"],
      [
        "ag",
        "Dạ có ạ. Đại Việt giao và lắp tận nhà tại Nghệ An, kỹ thuật viên hướng dẫn bố mẹ chị dùng, sau đó gửi chị video bàn giao.",
        "09:58",
      ],
      [
        "cu",
        "Chị định mua X9 tặng bố mẹ dịp Tết. Giao về xóm 5, xã Diễn Thành, Diễn Châu, Nghệ An nha em.",
        "10:01",
      ],
      ["cu", "Chị ở bên Hàn, mua online sợ lắm. Có cách nào xem ghế thật không?", "10:03"],
      ["sys", "Agent chuyển cho người: khách cần xác minh niềm tin, đề xuất video call", "10:04"],
    ],
    suggestions: [
      "Dạ em là My ở showroom Đại Việt Quận 4. Tối nay 21:00 giờ Hàn em gọi video cho chị, em ngồi thử ghế DV-X9 cho chị xem trực tiếp, chị hỏi gì em trả lời hết nhé.",
      "Dạ em gửi chị 3 video bàn giao của các cô chú ở Nghệ An trước, tối em gọi video cho chị xem ghế thật ạ.",
    ],
    followUp: "Ok em, 21h tối nay chị gọi nha. Cho chị xem kỹ phần massage chân.",
    moveOpportunity: "o1",
  },
  {
    id: "v2",
    tags: ["Hỏi giá", "Quan tâm ghế"],
    name: "phuong.kr92",
    channel: "TikTok Live",
    location: "Không rõ",
    status: "agent",
    worried: false,
    time: "10:01",
    intent: "Hỏi giá DV-X9, giao Bình Định",
    summary: "Bình luận trong live 20:00 tối qua. Agent đã trả lời giá, mời để lại số Zalo để tư vấn riêng.",
    messages: [
      ["cu", "Ghế X9 giá nhiu, ship Bình Định đc ko shop", "20:41"],
      [
        "ag",
        "Dạ DV-X9 hiện 79,9 triệu, giao và lắp tận nhà tại Bình Định ạ. Chị để lại Zalo, em gửi video và báo giá chi tiết nhé.",
        "20:41",
      ],
      ["cu", "0388•••241 nha", "20:43"],
      ["sys", "Agent Phân lead: tạo lead mới, giao Thảo", "20:43"],
    ],
    suggestions: [],
  },
  {
    id: "v3",
    assignee: "My",
    tags: ["Khách Hàn", "Đã chốt"],
    name: "Võ Thanh Tùng",
    houseId: "h5",
    channel: "Facebook",
    location: "Gimhae",
    status: "agent",
    worried: false,
    time: "09:40",
    intent: "Hỏi lịch giao",
    summary:
      "Anh Tùng hỏi lịch giao ghế cho bố. Agent báo hẹn 10/10, gửi tên kỹ thuật viên và hứa gửi video bàn giao.",
    messages: [
      ["cu", "Ghế của bố anh bao giờ giao em?", "09:38"],
      [
        "ag",
        "Dạ đơn DV-1027 hẹn giao và lắp ngày 10/10 tại Dĩ An. Kỹ thuật viên sẽ gọi bác Hai trước 1 tiếng. Lắp xong em gửi anh video bàn giao ngay ạ.",
        "09:39",
      ],
      ["cu", "Ok em, cảm ơn.", "09:40"],
    ],
    suggestions: ["Dạ không có gì anh. Có gì bác cần, anh cứ nhắn em nhé."],
  },
  {
    id: "v4",
    tags: ["Khách cũ", "Quan tâm máy lọc"],
    name: "Phạm Ngọc Lan",
    houseId: "h3",
    channel: "Hotline",
    location: "Quận 4",
    status: "done",
    worried: false,
    time: "09:15",
    intent: "Hẹn thay lõi lọc",
    summary:
      "Chị Lan hẹn thay lõi lọc hôm nay 16:00. Trong cuộc gọi, chị nhắc em trai ở Seoul muốn mua ghế cho bố. Agent Hộ gia đình đã gộp anh Đức vào hộ Phạm.",
    messages: [
      ["sys", "Bản ghi cuộc gọi, đã che số điện thoại", "09:12"],
      ["cu", "Máy lọc nhà chị tới hạn thay lõi chưa em?", "09:12"],
      ["hu", "Dạ tới hạn tháng này ạ. Em hẹn kỹ thuật viên ghé chị 16:00 chiều nay nhé.", "09:13"],
      ["cu", "Ừ. Mà thằng em chị bên Seoul nó cũng đang tính mua ghế cho ông già đó.", "09:14"],
      ["sys", "Agent Hộ gia đình: đã nối Phạm Minh Đức (Seoul) vào hộ Phạm", "09:15"],
    ],
    suggestions: [],
  },
  {
    id: "v5",
    assignee: "Thảo",
    tags: ["Khách Hàn", "Khách cũ", "Ưu đãi 20/10"],
    name: "Lê Hoàng Phúc",
    houseId: "h4",
    channel: "Zalo",
    location: "Incheon",
    status: "agent",
    worried: false,
    time: "08:52",
    intent: "Hỏi ưu đãi 20/10 cho mẹ",
    summary:
      "Lead cũ 45 ngày im lặng, vừa phản hồi tin nhắc 20/10. Agent gửi ưu đãi và mốc chốt đơn để kịp giao.",
    messages: [
      [
        "ag",
        "Anh Phúc ơi, còn 16 ngày nữa là 20/10. Nếu anh muốn tặng mẹ ghế massage, đặt trước 13/10 là kịp giao về Cao Lãnh ạ.",
        "08:30",
      ],
      ["cu", "Còn ưu đãi 20/10 cho mẹ không em?", "08:50"],
      [
        "ag",
        "Dạ còn ạ, đặt trước 13/10 anh được tặng gối massage cổ và miễn phí lắp đặt. Tối nay chị Thảo gọi anh tư vấn kỹ hơn nhé.",
        "08:52",
      ],
    ],
    suggestions: ["Dạ em là Thảo, tối nay 20:00 giờ Hàn em gọi anh được không ạ?"],
  },
];

// ---------------------------------------------------------------------------
// Kênh, báo cáo
// ---------------------------------------------------------------------------

// [kênh, lead, chi phí (triệu), đơn, doanh thu (triệu)]
export const CHANNEL_STATS: [string, number, number, number, number][] = [
  ["Facebook Ads nhắm người Việt tại Hàn", 412, 58.4, 31, 612],
  ["Live TikTok tại showroom", 186, 9.6, 17, 380],
  ["KOC người Việt tại Hàn", 94, 22, 11, 268],
  ["TikTok Shop", 61, 4.8, 9, 214],
  ["Zalo OA, lead cũ làm nóng", 138, 1.9, 12, 342],
  ["Khách đến showroom", 47, 0, 14, 388],
  ["Giới thiệu từ khách cũ", 22, 0, 8, 231],
];

export const LIVESTREAMS: [string, string, string][] = [
  ["Hôm nay 20:00", "Demo DV-X9, so sánh với ghế giá rẻ", "22:00 giờ Hàn"],
  ["Thứ Bảy 19:30", "Quà 20/10 cho mẹ, kèm khách thật gọi về", "21:30 giờ Hàn"],
  ["Chủ nhật 15:00", "Giải đáp giao lắp tỉnh xa, có kỹ thuật viên", "17:00 giờ Hàn"],
];

export const KOC_BOOKINGS: [string, string, string, string][] = [
  ['KOC "Vợ chồng Ansan"', "48k theo dõi", "Đăng thứ Bảy", "Đã duyệt kịch bản"],
  ['KOC "Chị Hạnh Daegu"', "31k theo dõi", "Đăng Chủ nhật", "Chờ video"],
  ["KOL ẩm thực Việt ở Seoul", "210k theo dõi", "Đang báo giá", "Chờ duyệt ngân sách"],
];

export const CONTENT_QUEUE: [string, string, string][] = [
  ["Video bàn giao hộ Bùi, Nam Định", "Gửi người tặng, sau đó làm ads", "Đang dựng"],
  ["Video bàn giao hộ Trần, Long An", "Đã được khách đồng ý dùng làm ads", "Đã đăng"],
  ["Clip 30 giây: một ngày bố mẹ dùng ghế", "Dùng cho chiến dịch 20/10", "Chờ quay"],
];

export const OCCASIONS: [string, string, string, string][] = [
  ["20/10", "Ngày Phụ nữ Việt Nam", "16 ngày", "37 hộ có mẹ hoặc vợ ở Việt Nam"],
  ["12/11", "Mừng thọ trong hồ sơ hộ", "39 ngày", "5 hộ có bố mẹ tròn 60, 70, 80"],
  ["Tết 2027", "Dịp tặng lớn nhất năm", "khoảng 4 tháng", "214 hộ, phải chốt trước 15/1 để kịp giao"],
];

export const GOAL = 3000; // triệu đồng, quý IV
export const DAYS_LEFT = 89;

export const MONTH_PLAN: [string, number, number][] = [
  ["Tháng 10", 650, 186],
  ["Tháng 11", 900, 0],
  ["Tháng 12", 1450, 0],
];

export const FUNNEL: [string, number][] = [
  ["Lead", 960],
  ["Đã liên hệ", 812],
  ["Demo, video call", 286],
  ["Báo giá", 204],
  ["Đặt cọc", 99],
];

export const PRODUCT_MIX: [string, number, "brand" | "ok"][] = [
  ["Ghế DV-X9", 46, "brand"],
  ["Ghế DV-S7", 31, "brand"],
  ["Ghế DV-M5", 14, "brand"],
  ["Máy lọc nước, lõi lọc", 9, "ok"],
];

export const GLOBAL_RULES = [
  "Chỉ liên hệ người đã đồng ý nhận tin, lưu căn cứ theo Luật Bảo vệ dữ liệu cá nhân.",
  "Không liên hệ người nhận quà khi người tặng chưa cho phép, để giữ bất ngờ.",
  "Gọi khách ở Hàn trong khung 19:00–22:30 giờ Hàn hoặc cuối tuần.",
  "Giảm giá trên 5%, quà tặng trên 3 triệu cần quản lý showroom duyệt.",
  "Khách hỏi về sức khỏe, bệnh lý khi dùng ghế: chuyển người, khuyên hỏi bác sĩ.",
  "Mọi hành động truy vết được.",
];

/** Các bước truy vết quyết định của từng agent (màn hình Agent). */
export function traceSteps(agent: AgentId, time: string): { title: string; text: string; ok?: string[] }[] {
  const t: Record<AgentId, { title: string; text: string; ok?: string[] }[]> = {
    lead: [
      {
        title: "Đọc dữ liệu",
        text: "Nguồn quảng cáo, số +82, tỉnh nhận quà khách khai, giờ hiện tại ở Hàn.",
      },
      { title: "Kiểm luật", text: "", ok: ["trong 5 phút", "Thảo đang rảnh"] },
      { title: "Quyết định", text: "Điểm chốt 52, xếp vào hàng gọi khung 19:00 giờ Hàn." },
      { title: "Hành động", text: `Giao Thảo lúc ${time}, chi phí AI 30đ.` },
    ],
    tele: [
      { title: "Đọc dữ liệu", text: "Bản ghi cuộc gọi, đã che số điện thoại." },
      { title: "Kiểm luật", text: "", ok: ["không có cam kết giá ngoài bảng"] },
      { title: "Quyết định", text: "Bóc người nhận, dịp tặng, ngân sách, lo ngại chính." },
      { title: "Hành động", text: `Ghi vào hồ sơ hộ lúc ${time}, chi phí 120đ.` },
    ],
    nurture: [
      { title: "Đọc dữ liệu", text: "Lead im lặng 38 ngày, tỉnh nhận quà, sản phẩm đã hỏi." },
      { title: "Kiểm luật", text: "", ok: ["đã đồng ý nhận tin", "1/2 tin tuần này"] },
      { title: "Quyết định", text: "Chọn video bàn giao cùng tỉnh, độ tin cậy 0,81." },
      { title: "Hành động", text: `Gửi Zalo lúc ${time}, chi phí 45đ.` },
    ],
    occasion: [
      { title: "Đọc dữ liệu", text: "Ngày sinh bố mẹ trong phiếu bảo hành, lịch 20/10 và Tết." },
      {
        title: "Kiểm luật",
        text: "",
        ok: ["nhắc trước 16 ngày", "chỉ nhắn người đặt, không liên hệ người nhận"],
      },
      { title: "Quyết định", text: "Gợi ý quà phù hợp với sản phẩm hộ đã có." },
      { title: "Hành động", text: `Gửi lúc ${time}, chi phí 60đ.` },
    ],
    trust: [
      { title: "Đọc dữ liệu", text: "Trạng thái giao lắp, video bàn giao đã duyệt." },
      { title: "Kiểm luật", text: "", ok: ["trong 24 giờ sau lắp"] },
      { title: "Quyết định", text: "Gửi video kèm lời cảm ơn, hẹn xin đánh giá sau 3 ngày." },
      { title: "Hành động", text: `Gửi người đặt ở Hàn lúc ${time}, chi phí 40đ.` },
    ],
    house: [
      { title: "Đọc dữ liệu", text: "Địa chỉ giao, số người nhận, lời khai quan hệ." },
      { title: "Kiểm luật", text: "", ok: ["có 2 bằng chứng trùng khớp"] },
      { title: "Quyết định", text: "Gộp vào hộ, cập nhật vai trò người nhận." },
      { title: "Hành động", text: `Cập nhật hồ sơ hộ lúc ${time}, chi phí 15đ.` },
    ],
  };
  return t[agent];
}

// ---------------------------------------------------------------------------
// Định dạng tiền theo đơn vị triệu như bản mẫu
// ---------------------------------------------------------------------------

export function tr(v: number): string {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(v)}tr`;
}

export function ty(v: number): string {
  return `${new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v / 1000)} tỷ`;
}
