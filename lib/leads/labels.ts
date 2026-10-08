// Nhãn tiếng Việt cho các giá trị cố định của lead (CLAUDE.md mục 6). Danh mục sửa được trong Cài đặt nằm ở
// bảng riêng (lead_sources, occasions…); đây chỉ là các giá trị enum trong code.

export const LEAD_SOURCE_LABEL: Record<string, string> = {
  meta_lead_ads: "Form quảng cáo Facebook",
  zalo_oa: "Zalo OA",
  meta_messenger: "Tin nhắn Facebook",
  hotline: "Hotline",
  walk_in: "Khách đến showroom",
  tiktok_live: "Live TikTok",
  referral: "Khách cũ giới thiệu",
  import: "Dữ liệu cũ nhập lại",
  manual: "Nhập tay",
};

export const leadSourceLabel = (source: string | null | undefined) =>
  (source && LEAD_SOURCE_LABEL[source]) || "Không rõ nguồn";

export const LEAD_STAGE_LABEL: Record<string, string> = {
  new: "Mới",
  contacted: "Đã liên hệ",
  demo: "Đã tư vấn, demo",
  quoted: "Đã gửi báo giá",
  deposit: "Đã đặt cọc",
  won: "Chốt đơn",
  lost: "Thất bại",
};
