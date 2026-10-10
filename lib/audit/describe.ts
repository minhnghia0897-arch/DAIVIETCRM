import { leadSourceLabel } from "@/lib/leads/labels";

// Đổi một dòng nhật ký kiểm toán (audit_logs) thành chữ tiếng Việt cho màn Nhật ký kiểm toán: tên hành động và
// chi tiết "trường: cũ → mới". Không để tên bảng, tên cột tiếng Anh hay mã nội bộ lọt ra giao diện (DESIGN.md 11).
// Hàm thuần; nhật ký không bao giờ chứa số điện thoại hay nội dung tin nhắn (CLAUDE.md mục 4).

const CATALOG_LABEL: Record<string, string> = {
  lead_sources: "nguồn lead",
  occasions: "dịp tặng",
  call_outcomes: "kết quả cuộc gọi",
  lost_reasons: "lý do thất bại",
  budget_ranges: "ngân sách",
};

const ACTION_LABEL: Record<string, string> = {
  "role_permission.grant": "Bật quyền cho vai trò",
  "role_permission.revoke": "Tắt quyền của vai trò",
  "user_permission.insert": "Đặt quyền riêng cho người dùng",
  "user_permission.update": "Đổi quyền riêng của người dùng",
  "user_permission.delete": "Bỏ quyền riêng của người dùng",
  "profile.invite": "Mời người dùng",
  "profile.lock": "Khóa người dùng",
  "profile.unlock": "Mở khóa người dùng",
  "profile.role_change": "Đổi vai trò",
  "view_as.start": "Bắt đầu xem như người dùng",
  "view_as.end": "Kết thúc xem như người dùng",
  "integration.secret_set": "Lưu khóa đấu nối",
  "integration.secret_replace": "Thay khóa đấu nối",
  "integration.secret_delete": "Xóa khóa đấu nối",
  "integration.update": "Đổi cấu hình đấu nối",
  "lead.create": "Tạo lead",
  "lead.attach": "Ghi vào lead đang có",
  "lead.assign": "Giao lead",
  "contact.reveal_identity": "Xem số điện thoại",
  "duty.start": "Bật trực",
  "duty.end": "Tắt trực",
  "duty.end_by_manager": "Quản lý tắt trực hộ",
  "telegram.link_code": "Tạo mã liên kết Telegram",
  "telegram.unlinked": "Bỏ liên kết Telegram",
  "approval.approved": "Duyệt đề xuất",
  "approval.rejected": "Từ chối đề xuất",
  "approval.expired": "Đề xuất hết hạn",
  "shifts.insert": "Thêm ca trực",
  "shifts.update": "Sửa ca trực",
  "shift_members.insert": "Xếp người vào ca",
  "shift_members.delete": "Bỏ người khỏi ca",
  "absences.insert": "Ghi ngày nghỉ",
  "absences.update": "Sửa ngày nghỉ",
  "settings.assignment_rules.update": "Sửa luật phân lead",
  "settings.markets.insert": "Thêm thị trường",
  "settings.markets.update": "Sửa thị trường",
  "campaign.create": "Tạo chiến dịch",
  "campaign.update": "Sửa chiến dịch",
  "campaign.budget_set": "Đặt ngân sách chiến dịch",
  "campaign.spend": "Ghi chi phí quảng cáo",
  "content.create": "Thêm bài vào lịch nội dung",
  "content.move": "Chuyển cột bài nội dung",
  "content.delete": "Xóa bài khỏi lịch nội dung",
};

export function auditActionLabel(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  const m = action.match(/^settings\.([a-z_]+)\.(insert|update|delete)$/);
  if (m && CATALOG_LABEL[m[1]])
    return `${m[2] === "insert" ? "Thêm" : m[2] === "update" ? "Sửa" : "Bỏ"} mục ${CATALOG_LABEL[m[1]]}`;
  return "Thao tác khác";
}

const FIELD_LABEL: Record<string, string> = {
  sla_minutes: "hạn gọi (phút)",
  max_uncontacted_per_person: "giới hạn lead chưa gọi",
  name: "tên",
  label: "nhãn",
  key: "mã",
  sort: "thứ tự",
  is_active: "đang dùng",
  timezone: "múi giờ",
  call_windows: "khung gọi",
  allowed_channels: "kênh được phép",
  country_code: "mã quốc gia",
  days: "ngày",
  start_time: "bắt đầu",
  end_time: "kết thúc",
  kind: "loại",
  starts_on: "từ ngày",
  ends_on: "đến ngày",
  note: "ghi chú",
  deleted_at: "đã hủy",
  count: "số lead",
  source: "nguồn",
  action: "kết quả",
  reason: "lý do",
  status: "trạng thái",
  enabled: "bật",
  reply_mode: "chế độ trả lời",
  before: "trước",
  after: "sau",
  permission: "quyền",
  integration: "đấu nối",
  secret: "khóa",
  config: "cấu hình",
  prerequisites_done: "điều kiện tiên quyết",
  platform: "nền tảng",
  self_approved: "tự duyệt",
  channel: "kênh",
};

const EFFECT: Record<string, string> = { grant: "cấp riêng", revoke: "thu riêng" };

/** Giá trị mã hóa của từng trường đổi sang chữ (trạng thái đấu nối, kết quả nhập lead, chế độ trả lời…). */
const VALUE_LABEL: Record<string, Record<string, string>> = {
  status: {
    not_available: "sắp có",
    not_connected: "chưa kết nối",
    connecting: "đang kết nối",
    connected: "đã kết nối",
    error: "lỗi",
    paused: "tạm dừng",
    draft: "bản nháp",
    signed: "đã ký",
    pending_approval: "chờ duyệt ngân sách",
    active: "đang chạy",
    ended: "đã kết thúc",
    rejected: "bị từ chối",
    idea: "ý tưởng",
    script: "viết kịch bản",
    production: "đang sản xuất",
    review: "chờ duyệt",
    scheduled: "đã lên lịch",
    published: "đã đăng",
  },
  action: {
    created: "khách mới",
    new_lead_existing_contact: "lead mới của khách cũ",
    attached: "ghi vào lead đang có",
  },
  reply_mode: { crm: "trả lời trên CRM", external: "trả lời ở công cụ khác", off: "tắt" },
  kind: { annual: "nghỉ phép", sick: "nghỉ ốm", business: "công tác", other: "khác" },
};

export interface AuditNames {
  permission?: (key: string) => string;
  integration?: (key: string) => string;
}

const SKIP = new Set([
  "id",
  "showroom_id",
  "created_at",
  "updated_at",
  "created_by",
  "approved_by",
  "user_id",
  "shift_id",
  "source_key",
  "mode",
  "working_hours",
  "color_token",
]);

const DAY = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const CHANNEL: Record<string, string> = {
  call: "gọi",
  zalo_oa: "Zalo OA",
  zns: "ZNS",
  sms: "SMS",
  email: "email",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function value(key: string, v: unknown, names: AuditNames = {}): string {
  if (v === null || v === undefined || v === "") return "trống";
  if (key === "permission" && names.permission) return names.permission(String(v));
  if (key === "integration" && names.integration) return names.integration(String(v));
  if (typeof v === "string" && EFFECT[v]) return EFFECT[v];
  if (typeof v === "string" && VALUE_LABEL[key]?.[v]) return VALUE_LABEL[key][v];
  if (key === "source" && typeof v === "string") return leadSourceLabel(v);
  if (typeof v === "boolean") return v ? "có" : "không";
  if (key === "days" && Array.isArray(v)) return v.map((d) => DAY[Number(d)] ?? d).join(", ");
  if (key === "allowed_channels" && Array.isArray(v)) return v.map((c) => CHANNEL[String(c)] ?? c).join(", ");
  if (key === "call_windows" && Array.isArray(v))
    return (
      v
        .map((w: { days?: number[]; start?: string; end?: string }) =>
          `${(w.days ?? []).map((d) => DAY[d]).join(" ")} ${w.start}–${w.end}`.trim(),
        )
        .join("; ") || "không có"
    );
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(String(v))) return String(v).slice(0, 5);
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(v))) return "có";
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (typeof v === "object") return "đã đổi";
  if (UUID.test(String(v))) return "";
  return String(v);
}

/** "hạn gọi (phút): 5 → 1" cho bản ghi có before/after; liệt kê trường đã biết cho bản ghi khác. */
export function auditDetail(meta: unknown, names: AuditNames = {}): string {
  if (!meta || typeof meta !== "object") return "";
  const m = meta as Record<string, unknown>;
  const before = m.before && typeof m.before === "object" ? (m.before as Record<string, unknown>) : null;
  const after = m.after && typeof m.after === "object" ? (m.after as Record<string, unknown>) : null;
  const head = (["permission", "integration"] as const)
    .filter((k) => m[k] !== undefined)
    .map((k) => `${FIELD_LABEL[k]}: ${value(k, m[k], names)}`);
  if (before || after) {
    const body = rowDiff(before, after);
    return [...head, body].filter(Boolean).join("; ");
  }
  const rank = (k: string) => {
    const i = ["permission", "integration", "secret", "before", "after"].indexOf(k);
    return i < 0 ? 99 : i;
  };
  return Object.entries(m)
    .filter(([k]) => !SKIP.has(k) && FIELD_LABEL[k])
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([k, v]) => [k, value(k, v, names)] as const)
    .filter(([, v]) => v)
    .map(([k, v]) => `${FIELD_LABEL[k]}: ${v}`)
    .join("; ");
}

function rowDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter(
    (k) => !SKIP.has(k) && FIELD_LABEL[k],
  );
  if (before && after) {
    const changed = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    return changed
      .map((k) =>
        typeof after[k] === "object" && after[k] !== null && !Array.isArray(after[k])
          ? `${FIELD_LABEL[k]} đã đổi`
          : `${FIELD_LABEL[k]}: ${value(k, before[k])} → ${value(k, after[k])}`,
      )
      .join("; ");
  }
  const row = (after ?? before)!;
  return keys
    .map((k) => [k, value(k, row[k])] as const)
    .filter(([, v]) => v)
    .map(([k, v]) => `${FIELD_LABEL[k]}: ${v}`)
    .join("; ");
}
