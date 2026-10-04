// Luồng trạng thái đơn hàng (CLAUDE.md 8.7). Hàm thuần: kiểm điều kiện từng bước chuyển, không đọc dữ liệu ngoài.

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

export interface OrderFacts {
  status: OrderStatus;
  hasRecipient: boolean;
  hasAddress: boolean;
  total: number;
  /** Tổng tiền đã được xác nhận (không tính khoản chờ xác nhận, không tính hoàn). */
  confirmedPaid: number;
  depositMinimum: number;
  /** Được duyệt thu khi giao. */
  codApproved: boolean;
  /** Phiếu xuất kho đã ghi sổ. */
  stockIssued: boolean;
  /** Mọi dòng có theo dõi serial đã được gán serial. */
  serialsAssigned: boolean;
}

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  draft: "confirmed",
  confirmed: "deposit_paid",
  deposit_paid: "ready_to_ship",
  ready_to_ship: "delivering",
  delivering: "installed",
  installed: "completed",
};

/** Lý do chặn bước chuyển; mảng rỗng là chuyển được. */
export function transitionBlockers(f: OrderFacts, to: OrderStatus): string[] {
  const out: string[] = [];
  if (to === "cancelled") {
    if (f.status === "completed" || f.status === "cancelled") out.push("Đơn đã kết thúc, không hủy được");
    return out;
  }
  if (f.status === "pending_approval") return ["Đơn đang chờ duyệt giảm giá"];
  if (NEXT_STATUS[f.status] !== to) return [`Không chuyển thẳng từ ${f.status} sang ${to}`];
  switch (to) {
    case "confirmed":
      if (!f.hasRecipient) out.push("Chưa có người nhận");
      if (!f.hasAddress) out.push("Chưa có địa chỉ giao");
      break;
    case "deposit_paid":
      if (f.confirmedPaid < f.depositMinimum) out.push(`Tiền cọc đã xác nhận chưa đủ mức tối thiểu`);
      break;
    case "ready_to_ship":
      if (f.confirmedPaid < f.total && !f.codApproved)
        out.push("Chưa thu đủ tiền và chưa được duyệt thu khi giao");
      break;
    case "delivering":
      if (!f.stockIssued) out.push("Chưa ghi sổ phiếu xuất kho");
      if (!f.serialsAssigned) out.push("Chưa gán serial cho hàng có serial");
      break;
  }
  return out;
}

/** Giai đoạn lead sinh từ trạng thái đơn (CLAUDE.md mục 6): đã cọc hoặc được duyệt thu khi giao → Đặt cọc; hoàn tất → Thành công. */
export function leadStageFromOrder(status: OrderStatus, codApproved: boolean): "deposit" | "won" | null {
  if (status === "completed") return "won";
  if (status === "deposit_paid") return "deposit";
  if (status === "ready_to_ship" && codApproved) return "deposit";
  return null;
}
