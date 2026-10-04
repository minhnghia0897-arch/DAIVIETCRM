// Thanh tab ứng dụng (DESIGN.md 4). Tab chỉ hiện khi người dùng có một trong các quyền xem
// và màn hình đã được dựng (`ready`). Không bao giờ suy từ tên vai trò.
export interface NavTab {
  href: string;
  label: string;
  anyOf: string[];
  ready: boolean;
}

export const NAV_TABS: NavTab[] = [
  { href: "/home", label: "Trang chủ", anyOf: ["lead.view_own", "lead.view_all"], ready: true },
  { href: "/leads", label: "Lead", anyOf: ["lead.view_own", "lead.view_all"], ready: false },
  { href: "/customers", label: "Khách", anyOf: ["lead.view_own", "lead.view_all"], ready: false },
  { href: "/inbox", label: "Hộp thư", anyOf: ["message.zalo_send", "message.view_all"], ready: false },
  { href: "/orders", label: "Đơn hàng", anyOf: ["order.view_own", "order.view_all"], ready: false },
  { href: "/products", label: "Sản phẩm", anyOf: ["product.view"], ready: false },
  { href: "/inventory", label: "Kho", anyOf: ["inventory.view"], ready: false },
  { href: "/team", label: "Đội ngũ", anyOf: ["kpi.own", "kpi.team"], ready: false },
  { href: "/reports", label: "Báo cáo", anyOf: ["report.own", "report.team"], ready: false },
];

export interface SettingsItem {
  href: string;
  label: string;
  perm: string;
}

// Khu Cài đặt (CLAUDE.md 11.2). Thêm mục khi màn hình được dựng.
export const SETTINGS_ITEMS: SettingsItem[] = [
  { href: "/settings/users", label: "Người dùng", perm: "settings.users" },
  { href: "/settings/permissions", label: "Phân quyền", perm: "settings.permissions" },
];

export function visibleTabs(perms: ReadonlySet<string>): NavTab[] {
  return NAV_TABS.filter((t) => t.ready && t.anyOf.some((p) => perms.has(p)));
}

export function visibleSettings(perms: ReadonlySet<string>): SettingsItem[] {
  return SETTINGS_ITEMS.filter((s) => perms.has(s.perm));
}
