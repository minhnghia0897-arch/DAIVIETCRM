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
  { href: "/opportunities", label: "Cơ hội", anyOf: ["lead.view_own", "lead.view_all"], ready: true },
  { href: "/households", label: "Hộ gia đình", anyOf: ["lead.view_own", "lead.view_all"], ready: true },
  { href: "/deliveries", label: "Đơn & giao lắp", anyOf: ["order.view_own", "order.view_all"], ready: true },
  { href: "/inbox", label: "Hội thoại", anyOf: ["message.zalo_send", "message.view_all"], ready: true },
  { href: "/channels", label: "Kênh & nội dung", anyOf: ["report.team"], ready: true },
  { href: "/reports", label: "Báo cáo", anyOf: ["report.own", "report.team"], ready: true },
  { href: "/agents", label: "Agent", anyOf: ["settings.integrations"], ready: true },
  { href: "/products", label: "Sản phẩm", anyOf: ["product.view"], ready: true },
  { href: "/inventory", label: "Kho", anyOf: ["inventory.view"], ready: true },
  { href: "/team", label: "Đội ngũ", anyOf: ["kpi.own", "kpi.team"], ready: true },
  { href: "/customers", label: "Khách", anyOf: ["lead.view_own", "lead.view_all"], ready: true },
  { href: "/orders", label: "Đơn hàng", anyOf: ["order.view_own", "order.view_all"], ready: true },
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
  return NAV_TABS.filter((t) => t.ready && t.anyOf.some((p) => perms.has(p))).map((t) =>
    // Telesale thấy tab Đội ngũ với tên "Hiệu suất của tôi" (DESIGN.md 4).
    t.href === "/team" && !perms.has("kpi.team") ? { ...t, label: "Hiệu suất của tôi" } : t,
  );
}

export function visibleSettings(perms: ReadonlySet<string>): SettingsItem[] {
  return SETTINGS_ITEMS.filter((s) => perms.has(s.perm));
}
