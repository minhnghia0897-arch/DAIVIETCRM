// Lý do AI chuyển cho người, dùng chung cho server, màn Hội thoại và Cài đặt, Trợ lý AI.

export const HANDOFF_LABEL: Record<string, string> = {
  call_request: "Khách cần gọi điện",
  purchase: "Khách muốn mua, cần gọi chốt",
  urgent: "Khách cần xử lý gấp",
  complaint: "Khách khiếu nại, hỏng hóc, bảo hành",
  health: "Khách hỏi về sức khỏe, bệnh lý",
  discount: "Khách xin giảm giá",
  human_request: "Khách muốn nói chuyện với nhân viên",
  unknown: "AI chưa trả lời được",
  budget: "AI hết ngân sách tháng",
  error: "AI gặp lỗi",
};
