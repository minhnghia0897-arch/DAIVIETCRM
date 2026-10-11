import {
  CONVERSATIONS,
  DAYS_LEFT,
  GOAL,
  houseById,
  tr,
  ty,
  type Conversation,
  type Opportunity,
} from "./crm-data";

// Trợ lý AI của bản demo: câu trả lời soạn sẵn theo câu hỏi gợi ý, đọc từ trạng thái mô phỏng.
// Trong hệ thật, câu hỏi được dịch thành truy vấn trên dữ liệu qua MCP server (CLAUDE.md 10.7).

export type AiView =
  "home" | "opps" | "house" | "orders" | "convos" | "channels" | "reports" | "agents" | "other";

export const AI_SUGGESTIONS: Record<AiView, string[]> = {
  home: ["Còn bao xa tới mục tiêu 3 tỷ?", "Hôm nay đội nên ưu tiên gì?", "Kênh nào mang khách Hàn tốt nhất?"],
  opps: ["Cơ hội nào sắp chốt?", "Vì sao lead kẹt trước bước demo?", "Gợi ý bước tiếp cho cơ hội đang chọn"],
  house: ["Tóm tắt hộ gia đình này", "Nên bán chéo gì cho hộ này?", "Soạn tin cho người đặt ở Hàn"],
  orders: ["Đơn nào có rủi ro trước dịp lễ?", "Soạn tin cập nhật cho người tặng"],
  convos: ["Tóm tắt hội thoại cần người", "Khách ở Hàn lo ngại điều gì nhiều nhất?"],
  channels: ["Nên dồn ngân sách vào kênh nào?", "Ý tưởng nội dung tuần này"],
  reports: ["Tóm tắt báo cáo này", "Có đạt 3 tỷ cuối năm không?"],
  agents: ["Agent nào cần chỉnh luật?", "Chi phí AI hôm nay bao nhiêu?"],
  other: ["Hôm nay đội nên ưu tiên gì?", "Còn bao xa tới mục tiêu 3 tỷ?"],
};

export interface AiAnswer {
  paragraphs: string[];
  draft?: string;
  bars?: [string, number][];
}

export interface AiOrder {
  id: string;
  code: string;
  buyer: string;
  recipient: string;
  status: string;
  risks: string[];
}

export interface AiContext {
  view: AiView;
  revenue: number;
  minutes: string;
  autoCount: number;
  opps: Opportunity[];
  oppSel: string;
  houseSel: string;
  /** Đơn hàng trong phạm vi quyền của người hỏi. */
  orders: AiOrder[];
  /** Đơn đang mở (trang hồ sơ đơn), nếu có. */
  orderSel?: string;
  convs: Conversation[];
  /** Có `report.team`: được nghe số liệu cả showroom (doanh thu, mục tiêu, báo cáo). */
  team: boolean;
}

const NO_TEAM: AiAnswer = {
  paragraphs: [
    "Câu này dùng số liệu cả showroom, cần quyền xem báo cáo cả đội. Em chỉ trả lời được theo khách và đơn anh chị đang phụ trách.",
  ],
};

export function aiAnswer(question: string, c: AiContext): AiAnswer {
  const t = question.toLowerCase();
  const open = c.opps.filter((o) => o.stage < 5);
  const pipeline = open.reduce((s, o) => s + o.value, 0);
  const opp = c.opps.find((o) => o.id === c.oppSel) ?? c.opps[0];
  // Trợ lý chạy dưới quyền người hỏi (CLAUDE.md 10.7): ngữ cảnh truyền vào đã lọc theo phạm vi xem.
  const h = c.houseSel ? houseById(c.houseSel) : undefined;
  const teamOnly = ["3 tỷ", "ưu tiên", "báo cáo"].some((k) => t.includes(k));
  if (teamOnly && !c.team) return NO_TEAM;
  const d = c.orders.find((x) => x.id === c.orderSel) ?? c.orders.find((x) => x.risks.length) ?? c.orders[0];

  if (t.includes("3 tỷ") && t.includes("bao xa"))
    return {
      paragraphs: [
        `Đã đạt ${ty(c.revenue)}, còn ${ty(GOAL - c.revenue)} trong ${DAYS_LEFT} ngày, tức khoảng ${tr((GOAL - c.revenue) / DAYS_LEFT)}/ngày, tương đương 1 ghế DV-S7 mỗi 1,5 ngày.`,
        `Pipeline đang mở ${tr(pipeline)}. Điểm nghẽn không phải lead mà là bước từ Đã liên hệ sang Demo.`,
      ],
    };
  if (t.includes("ưu tiên"))
    return {
      paragraphs: [
        "Ba việc đáng làm nhất hôm nay:",
        "1. Tối nay 21:00 giờ Hàn, My video call với chị Thu (DV-X9, 79,9tr). Khách lo niềm tin, không lo giá.",
        "2. Thảo gọi anh Phúc trước 13/10 để kịp quà 20/10.",
        "3. Vy hoàn tất video bàn giao hộ Bùi. Mỗi video vừa giữ khách cũ vừa thành quảng cáo.",
      ],
    };
  if (t.includes("kênh") && (t.includes("khách hàn") || t.includes("ngân sách")))
    return {
      paragraphs: [
        "Facebook Ads nhắm người Việt tại Hàn vẫn là nguồn lead chính, nhưng chi phí mỗi đơn khoảng 1,9tr. KOC tại Hàn khoảng 2tr mỗi đơn, đổi lại tạo niềm tin tốt hơn.",
        "Đề xuất: giữ ngân sách Facebook, chuyển phần tăng thêm sang quảng cáo dùng video bàn giao khách thật cùng tỉnh, và bắt buộc mời video call trước khi báo giá.",
      ],
    };
  if (t.includes("sắp chốt"))
    return {
      paragraphs: c.opps
        .filter((o) => o.stage >= 3 && o.stage < 5)
        .map(
          (o) =>
            `${o.name} (${o.product.replace("Ghế massage ", "")}, ${tr(o.value)}, điểm ${o.score}): ${o.next}`,
        ),
    };
  if (t.includes("kẹt"))
    return {
      paragraphs: [
        "Lead từ Hàn kẹt trước bước demo vì khách chưa tin mua từ xa. Khách đã video call chốt 48%, khách chỉ nhận báo giá qua tin chốt 12%.",
        "Nên đổi kịch bản tele: không gửi giá trước, mà hẹn video call với showroom trong 48 giờ đầu.",
      ],
    };
  if (t.includes("bước tiếp") && opp) return { paragraphs: [`${opp.name}: ${opp.next}`] };
  if (
    (t.includes("hộ gia đình") || t.includes("bán chéo") || (t.includes("soạn tin") && c.view === "house")) &&
    !h
  )
    return { paragraphs: ["Chưa chọn hộ gia đình nào trong phạm vi anh chị được xem."] };
  if (t.includes("tóm tắt hộ gia đình") && h) {
    const payers = h.members
      .filter((m) => m.loc === "KR")
      .map((m) => `${m.name} ở ${m.city} là người trả tiền`);
    return {
      paragraphs: [
        `${h.name}, ${h.place}: ${h.members.length} thành viên. ${payers.join("; ") || "Không có thành viên ở Hàn"}.`,
        `${h.owned.length ? `Đã có: ${h.owned.map((x) => x[0]).join(", ")}.` : "Chưa mua sản phẩm nào."} ${h.trust[0]}.`,
        `Cơ hội lớn nhất: ${h.cross[0].title.toLowerCase()}.`,
      ],
    };
  }
  if (t.includes("bán chéo") && h)
    return { paragraphs: h.cross.map((x) => `${x.title} (${tr(x.value)}): ${x.detail}`) };
  if (t.includes("soạn tin") && c.view === "house" && h) {
    const m = h.members.find((x) => x.role === "Người đặt") ?? h.members[0];
    const first = m.name.split(" ").pop();
    const xưng = m.rel === "Con gái" ? "chị" : "anh";
    return {
      paragraphs: [`Bản nháp gửi ${m.name}:`],
      draft: h.owned.length
        ? `Chào ${xưng} ${first}, Đại Việt Quận 4 đây ạ. Ghế của hai bác ở nhà vẫn dùng tốt chứ ạ? Tháng 11 là sinh nhật 70 tuổi của bác trai, nếu ${xưng} muốn chuẩn bị quà mừng thọ, bên em có máy lọc nước ion kiềm rất hợp với nhà dùng nước giếng. Em gửi ${xưng} thông tin nhé.`
        : `Chào ${xưng} ${first}, em là My ở showroom Đại Việt Quận 4. Em gửi ${xưng} video bàn giao của các cô chú ở cùng tỉnh. Nếu tiện, tối nay em gọi video cho ${xưng} xem ghế thật nhé.`,
    };
  }
  if (t.includes("rủi ro"))
    return {
      paragraphs: [
        ...c.orders
          .filter((x) => x.risks.length)
          .map((x) => `${x.code} (${x.buyer}): ${x.status}, ${x.risks.join(", ")}.`),
        "Với đơn Tết, đội lắp đặt tuyến miền Trung cần chốt lịch trước 15/12.",
      ],
    };
  if (t.includes("cập nhật cho người tặng") && d) {
    const who = d.recipient.match(/\(([^)]+)\)/)?.[1] ?? (d.recipient || "người nhận");
    return {
      paragraphs: [`Bản nháp cho ${d.buyer}:`],
      draft: `Chào anh chị, Đại Việt cập nhật đơn ${d.code}: hiện đơn đang ở bước "${d.status}". Lắp xong em gửi video bàn giao tại nhà ${who} ngay ạ.`,
    };
  }
  if (t.includes("cần người")) {
    const need = c.convs.filter((x) => x.status === "need");
    return {
      paragraphs: need.length
        ? need.map((x) => `${x.name} (${x.channel}, ${x.location}): ${x.summary}`)
        : ["Không còn hội thoại cần người."],
    };
  }
  if (t.includes("lo ngại"))
    return {
      paragraphs: [
        "Từ hội thoại 30 ngày với khách ở Hàn, ba lo ngại lớn nhất:",
        "Cả ba đều là bài toán niềm tin. Video call, video bàn giao và bảo hành điện tử gửi về Zalo người tặng giải được cả ba.",
      ],
      bars: [
        ["Sợ mua từ xa bị lừa", 44],
        ["Giao lắp tỉnh xa", 31],
        ["Bảo hành khi mình ở Hàn", 25],
      ],
    };
  if (t.includes("nội dung"))
    return {
      paragraphs: [
        "Ba ý tưởng cho tuần này:",
        '1. "Gọi về cho mẹ": quay khách ở Hàn video call với bố mẹ đang ngồi ghế.',
        "2. Live Thứ Bảy: kỹ thuật viên lắp ghế thật, trả lời giao lắp tỉnh xa.",
        "3. Clip 30 giây cho 20/10: món quà con gửi từ Hàn về.",
      ],
    };
  if (t.includes("báo cáo"))
    return {
      paragraphs: [
        "Ba điểm chính:",
        "1. 78% doanh thu đến từ người đặt ở Hàn, đúng trọng tâm.",
        "2. Nút thắt là bước Đã liên hệ sang Demo; video call là đòn bẩy lớn nhất.",
        "3. 86% hộ mới mua một sản phẩm. Bán chéo máy lọc nước cho hộ đã có ghế là doanh thu rẻ nhất.",
      ],
    };
  if (t.includes("đạt 3 tỷ"))
    return {
      paragraphs: [
        "Có thể, nếu tháng 12 đạt khoảng 1,45 tỷ. Điều kiện:",
        "1. Từ giữa tháng 10 nuôi lead Tết, vì khách ở Hàn cân nhắc 3–6 tuần.",
        "2. Tỷ lệ chốt sau video call giữ trên 40%.",
        "3. Đội lắp đặt đủ năng lực cho khoảng 25 ghế trong 2 tuần cao điểm trước Tết.",
        "Rủi ro lớn nhất không phải lead mà là năng lực giao lắp tỉnh xa sát Tết.",
      ],
    };
  if (t.includes("chỉnh luật"))
    return {
      paragraphs: [
        "Agent Trợ lý tele đẩy nhiều việc duyệt nhất vì ngưỡng giảm giá 5% thấp với dòng DV-X9. Đề xuất: cho phép tới 7% với DV-X9 khi khách có dịp tặng rõ ràng, giữ 5% cho dòng khác.",
      ],
    };
  if (t.includes("chi phí ai"))
    return {
      paragraphs: [
        `Hôm nay đến ${c.minutes}, khoảng ${new Intl.NumberFormat("vi-VN").format(Math.round(c.autoCount * 70 + 12000))}đ cho ${c.autoCount} việc. Rất nhỏ so với một đơn ghế; chi phí đáng theo dõi là quảng cáo và phí tin nhắn.`,
      ],
    };
  return {
    paragraphs: [
      "Bản demo trả lời được các câu hỏi gợi ý bên dưới. Trong hệ thật, câu hỏi được dịch thành truy vấn trên dữ liệu hộ gia đình, lead, đơn và hội thoại.",
    ],
  };
}

export { CONVERSATIONS };
