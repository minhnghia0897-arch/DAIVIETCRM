// Danh sách quyền giai đoạn 1 (CLAUDE.md mục 5). Đây là nguồn gốc duy nhất:
// seed.sql phải khớp danh sách này (có unit test kiểm tra), giao diện đọc nhãn từ đây.

export type RoleKey = "owner" | "sale_admin" | "telesale" | "marketing";

export interface PermissionDef {
  key: string;
  group: string;
  label: string;
  /** false: chỉ Owner, không cấp được qua vai trò hay quyền riêng. */
  grantable: boolean;
  /** Hiện nhãn "Nhạy cảm", bật lên phải xác nhận (DESIGN.md 6.5). */
  sensitive: boolean;
  defaults: RoleKey[];
}

const O: RoleKey = "owner";
const S: RoleKey = "sale_admin";
const T: RoleKey = "telesale";
const M: RoleKey = "marketing";

function p(
  key: string,
  group: string,
  label: string,
  defaults: RoleKey[],
  opts: { grantable?: boolean; sensitive?: boolean } = {},
): PermissionDef {
  return {
    key,
    group,
    label,
    defaults,
    grantable: opts.grantable ?? true,
    sensitive: opts.sensitive ?? false,
  };
}

export const PERMISSIONS: readonly PermissionDef[] = [
  p("lead.view_own", "Lead", "Xem lead được giao cho mình", [O, S, T]),
  p("lead.view_all", "Lead", "Xem mọi lead của showroom", [O, S]),
  p("lead.create", "Lead", "Tạo lead", [O, S, T]),
  p("lead.edit_own", "Lead", "Sửa lead của mình", [O, S, T]),
  p("lead.edit_all", "Lead", "Sửa mọi lead", [O, S]),
  p("lead.assign", "Lead", "Giao, chuyển lead cho người khác", [O, S]),
  p("lead.import", "Lead", "Nhập lead từ file", [O, S]),
  p("lead.export", "Lead", "Xuất danh sách khách ra file", [O], { sensitive: true }),
  p("lead.delete", "Lead", "Xóa lead", [O], { sensitive: true }),
  p("lead.mark_lost", "Lead", "Đánh dấu lead thất bại", [O, S, T]),
  p("lead.receive", "Lead", "Được phân lead tự động khi đang trực", [T]),
  p("contact.phone_reveal", "Khách", "Xem đầy đủ số điện thoại của mọi khách", [O, S], { sensitive: true }),
  p("contact.phone_reveal_assigned", "Khách", "Xem số đầy đủ của khách thuộc lead đang giao cho mình", [
    O,
    S,
    T,
  ]),
  p("contact.merge", "Khách", "Gộp hai hồ sơ khách trùng", [O, S]),
  p("household.manage", "Khách", "Tạo hộ, gắn thành viên vào hộ", [O, S, T]),
  p("call.make", "Cuộc gọi", "Gọi từ CRM", [O, S, T]),
  p("call.recording_own", "Cuộc gọi", "Nghe ghi âm cuộc gọi của mình", [O, S, T]),
  p("call.recording_all", "Cuộc gọi", "Nghe ghi âm của mọi người", [O, S], { sensitive: true }),
  p("message.zalo_send", "Tin nhắn", "Gửi tin Zalo OA", [O, S, T]),
  p("message.messenger_send", "Tin nhắn", "Gửi tin Messenger", [O, S, T]),
  p("message.view_all", "Tin nhắn", "Xem mọi hội thoại", [O, S]),
  p("catalog.view", "Danh mục", "Xem danh mục tra cứu", [O, S, T, M]),
  p("catalog.manage", "Danh mục", "Sửa danh mục tra cứu", [O, S]),
  p("product.view", "Sản phẩm", "Xem sản phẩm, giá bán, tồn khả dụng", [O, S, T, M]),
  p("product.manage", "Sản phẩm", "Thêm, sửa sản phẩm, SKU", [O, S]),
  p("product.view_cost", "Sản phẩm", "Xem giá vốn, biên lợi nhuận", [O], { sensitive: true }),
  p("price.manage", "Sản phẩm", "Sửa bảng giá", [O]),
  p("inventory.view", "Tồn kho", "Xem tồn kho, sổ kho", [O, S, T]),
  p("inventory.document", "Tồn kho", "Lập phiếu nhập, xuất, chuyển kho, kiểm kê", [O, S]),
  p("inventory.post", "Tồn kho", "Ghi sổ phiếu kho", [O, S]),
  p("inventory.count_approve", "Tồn kho", "Duyệt chênh lệch kiểm kê", [O]),
  p("combo.manage", "Combo", "Tạo, sửa combo", [O]),
  p("policy.view", "Chính sách", "Xem chính sách đang áp", [O, S, T, M]),
  p("policy.manage", "Chính sách", "Tạo, sửa, bật tắt chính sách", [O]),
  p("quote.create", "Báo giá, đơn", "Tạo, gửi báo giá", [O, S, T]),
  p("order.view_own", "Báo giá, đơn", "Xem đơn của mình", [O, S, T]),
  p("order.view_all", "Báo giá, đơn", "Xem mọi đơn", [O, S]),
  p("order.create", "Báo giá, đơn", "Tạo đơn", [O, S, T]),
  p("order.edit_own", "Báo giá, đơn", "Sửa đơn của mình", [O, S, T]),
  p("order.edit_all", "Báo giá, đơn", "Sửa mọi đơn", [O, S]),
  p("order.discount_approve", "Báo giá, đơn", "Duyệt đơn giảm giá vượt giới hạn", [O], { sensitive: true }),
  p("order.cancel", "Báo giá, đơn", "Hủy đơn", [O, S]),
  p("order.allow_backorder", "Báo giá, đơn", "Cho đặt trước khi chưa đủ hàng", [O, S]),
  p("order.export", "Báo giá, đơn", "Xuất danh sách đơn ra file", [O], { sensitive: true }),
  p("payment.record", "Thanh toán", "Ghi nhận khoản khách trả", [O, S, T]),
  p("payment.confirm", "Thanh toán", "Xác nhận tiền đã về", [O, S], { sensitive: true }),
  p("payment.refund", "Thanh toán", "Ghi hoàn tiền", [O], { sensitive: true }),
  p("staff.view", "Đội ngũ", "Xem hồ sơ làm việc của nhân sự", [O, S]),
  p("staff.manage", "Đội ngũ", "Sửa hồ sơ nhân sự, xếp ca, duyệt nghỉ", [O]),
  p("staff.offboard", "Đội ngũ", "Chạy trình bàn giao khi nghỉ việc", [O], { grantable: false }),
  p("target.manage", "Đội ngũ", "Đặt chỉ tiêu", [O]),
  p("kpi.own", "Đội ngũ", "Xem chỉ số của mình", [O, S, T, M]),
  p("kpi.team", "Đội ngũ", "Xem chỉ số của từng người trong đội", [O, S]),
  p("kpi.leaderboard", "Đội ngũ", "Xem bảng xếp hạng có tên", [O, S]),
  p("attendance.view_team", "Đội ngũ", "Xem giờ trực, nghỉ của đội", [O, S]),
  p("coaching.manage", "Đội ngũ", "Viết, đọc ghi chú kèm cặp", [O, S]),
  p("delivery.update", "Giao, bảo hành", "Cập nhật bước giao lắp", [O, S]),
  p("warranty.manage", "Giao, bảo hành", "Tạo, sửa phiếu bảo hành", [O, S]),
  p("report.own", "Báo cáo", "Xem báo cáo của mình", [O, S, T, M]),
  p("report.team", "Báo cáo", "Xem báo cáo cả đội", [O, S]),
  p("marketing.view", "Marketing", "Xem tổng quan marketing, chiến dịch, chi phí, hiệu quả theo nguồn", [
    O,
    S,
    M,
  ]),
  p("marketing.manage", "Marketing", "Tạo, sửa chiến dịch; nhập chi phí quảng cáo", [O, M]),
  p("marketing.budget_approve", "Marketing", "Duyệt ngân sách chiến dịch", [O], { sensitive: true }),
  p("settings.assignment", "Cài đặt", "Sửa luật phân lead, ca trực, thị trường", [O, S]),
  p("settings.integrations", "Cài đặt", "Kết nối Meta, Zalo, tổng đài", [O]),
  p("settings.users", "Cài đặt", "Mời, khóa người dùng", [O], { grantable: false }),
  p("settings.permissions", "Cài đặt", "Bật tắt quyền", [O], { grantable: false }),
  p("audit.view", "Kiểm toán", "Xem nhật ký kiểm toán", [O]),
];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS: ReadonlySet<string> = new Set(PERMISSIONS.map((x) => x.key));

/** Kiểm tra quyền trên danh sách quyền hiệu lực server đã tính (không bao giờ suy từ tên vai trò). */
export function can(effective: ReadonlySet<string> | readonly string[], perm: string): boolean {
  return Array.isArray(effective) ? effective.includes(perm) : (effective as ReadonlySet<string>).has(perm);
}

/**
 * Vai trò này có quyền mặc định không (bảng mặc định ở trên). Dùng khi cần nhóm nhân sự theo việc họ làm,
 * ví dụ "người nhận lead", thay cho so tên vai trò.
 */
export function roleDefaultHas(roleKey: string, perm: string): boolean {
  return PERMISSIONS.some((x) => x.key === perm && (x.defaults as readonly string[]).includes(roleKey));
}
