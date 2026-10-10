import type { Lifecycle, OrderStatus } from "./data";

export const LIFECYCLE: Record<Lifecycle, { label: string; tone: "ok" | "warn" | "err" | "neutral" }> = {
  lead: { label: "Lead", tone: "neutral" },
  new_customer: { label: "Khách mới", tone: "warn" },
  active_owner: { label: "Đang sử dụng", tone: "ok" },
  loyal: { label: "Khách thân", tone: "ok" },
  dormant: { label: "Ngủ đông", tone: "neutral" },
  at_risk: { label: "Có rủi ro", tone: "err" },
};

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: "ok" | "warn" | "err" | "neutral" }> = {
  draft: { label: "Nháp", tone: "neutral" },
  pending_approval: { label: "Chờ duyệt", tone: "warn" },
  confirmed: { label: "Chờ cọc", tone: "neutral" },
  deposit_paid: { label: "Đã cọc, giữ hàng", tone: "warn" },
  ready_to_ship: { label: "Sẵn sàng giao", tone: "neutral" },
  delivering: { label: "Đang giao", tone: "warn" },
  installed: { label: "Đã lắp", tone: "ok" },
  completed: { label: "Hoàn tất", tone: "ok" },
  cancelled: { label: "Đã hủy", tone: "err" },
};

export const ORDER_PATH: { status: OrderStatus; label: string }[] = [
  { status: "confirmed", label: "Xác nhận" },
  { status: "deposit_paid", label: "Đã cọc" },
  { status: "ready_to_ship", label: "Sẵn sàng giao" },
  { status: "delivering", label: "Đang giao" },
  { status: "installed", label: "Đã lắp" },
  { status: "completed", label: "Hoàn tất" },
];

export const MARKETS = [
  { country_code: "VN", name: "Việt Nam", color_token: "loc-vn" },
  { country_code: "KR", name: "Hàn Quốc", color_token: "loc-kr" },
];
