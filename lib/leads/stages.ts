// Chuyển giai đoạn lead bằng tay trên bảng Kanban (CLAUDE.md mục 6, Giai đoạn lead):
// - Mới → Đã liên hệ → Đã tư vấn, demo: người chuyển tay; sang Demo cần đủ bốn thông tin (database kiểm).
// - Từ Đã gửi báo giá trở đi giai đoạn chỉ sinh từ báo giá và đơn, không kéo tay được.
// - Thất bại cần lý do; lead đã cọc, đã chốt, đã thất bại không đánh thất bại từ bảng.
// Không kéo lùi để phễu giai đoạn và chỉ số chuyển đổi giữ đúng.

export const BOARD_STAGES = ["new", "contacted", "demo", "quoted", "deposit", "won", "lost"] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];

const MANUAL: Record<BoardStage, readonly BoardStage[]> = {
  new: ["contacted", "demo", "lost"],
  contacted: ["demo", "lost"],
  demo: ["lost"],
  quoted: ["lost"],
  deposit: [],
  won: [],
  lost: [],
};

/** Các cột được kéo lead sang từ giai đoạn hiện tại. */
export function manualTargets(from: string): readonly BoardStage[] {
  return MANUAL[from as BoardStage] ?? [];
}

/** Lý do không kéo được (câu cho người dùng); null khi kéo được. */
export function moveBlockReason(from: string, to: string): string | null {
  if (from === to) return null;
  if (manualTargets(from).includes(to as BoardStage)) return null;
  if (to === "quoted")
    return "Lead sang Đã gửi báo giá khi gửi báo giá đầu tiên cho khách, không kéo tay được.";
  if (to === "deposit") return "Lead sang Đã đặt cọc khi đơn có tiền cọc được xác nhận, không kéo tay được.";
  if (to === "won") return "Lead sang Chốt đơn khi đơn hoàn tất, không kéo tay được.";
  if (from === "won" || from === "lost") return "Lead đã đóng, không đổi giai đoạn được.";
  if (from === "deposit" && to === "lost")
    return "Lead đã có đơn đặt cọc: hủy đơn ở màn Đơn hàng trước khi đánh thất bại.";
  return "Không kéo lùi giai đoạn để phễu và chỉ số chuyển đổi giữ đúng.";
}

/** Lead còn thiếu thông tin nào trong bốn thông tin bắt buộc (mục 6). */
export function missingInfo(l: {
  recipient_contact_id: string | null;
  recipient_province: string | null;
  occasion_id: string | null;
  budget_range_id: string | null;
}): string[] {
  const out: string[] = [];
  if (!l.recipient_contact_id) out.push("mua cho ai");
  if (!l.recipient_province) out.push("tỉnh người nhận");
  if (!l.occasion_id) out.push("dịp");
  if (!l.budget_range_id) out.push("ngân sách");
  return out;
}
