// Nhãn trạng thái đơn trên bản thật (khớp lib/demo/labels.ts của bản mô phỏng, thêm các trạng thái đổi trả).

export type Tone = "ok" | "warn" | "err" | "neutral";

export const ORDER_STATUS_LIVE: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Nháp", tone: "neutral" },
  pending_approval: { label: "Chờ duyệt", tone: "warn" },
  confirmed: { label: "Chờ cọc", tone: "neutral" },
  deposit_paid: { label: "Đã cọc", tone: "warn" },
  ready_to_ship: { label: "Sẵn sàng giao", tone: "neutral" },
  delivering: { label: "Đang giao", tone: "warn" },
  installed: { label: "Đã lắp", tone: "ok" },
  completed: { label: "Hoàn tất", tone: "ok" },
  cancelled: { label: "Đã hủy", tone: "err" },
  return_requested: { label: "Yêu cầu đổi trả", tone: "warn" },
  returned: { label: "Đã trả hàng", tone: "err" },
};

export const ORDER_TONE: Record<Tone, string> = {
  ok: "is-ok",
  warn: "is-warn",
  err: "is-err",
  neutral: "is-n",
};

export const ORDER_PATH_LIVE: { status: string; label: string }[] = [
  { status: "confirmed", label: "Xác nhận" },
  { status: "deposit_paid", label: "Đã cọc" },
  { status: "ready_to_ship", label: "Sẵn sàng giao" },
  { status: "delivering", label: "Đang giao" },
  { status: "installed", label: "Đã lắp" },
  { status: "completed", label: "Hoàn tất" },
];

export const NEXT_STATUS_LIVE: Record<string, string> = {
  draft: "confirmed",
  confirmed: "deposit_paid",
  deposit_paid: "ready_to_ship",
  ready_to_ship: "delivering",
  delivering: "installed",
  installed: "completed",
};

export const NEXT_LABEL_LIVE: Record<string, string> = {
  confirmed: "Xác nhận đơn",
  deposit_paid: "Chuyển sang Đã cọc",
  ready_to_ship: "Chuyển sang Sẵn sàng giao",
  delivering: "Bắt đầu giao",
  installed: "Xác nhận đã lắp",
  completed: "Hoàn tất đơn",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Chuyển khoản tài khoản công ty",
  cash: "Tiền mặt tại showroom",
  cod: "Thu khi giao",
};
