// Thanh tab ứng dụng (DESIGN.md 4). Tab chỉ hiện khi người dùng có một trong các quyền xem
// và màn hình đã được dựng (`ready`). Không bao giờ suy từ tên vai trò.
export type NavSection = "work" | "sales" | "insight" | "admin";

/** Nhóm mục trên sidebar, theo thứ tự hiển thị. */
export const NAV_SECTIONS: { key: NavSection; label: string }[] = [
  { key: "work", label: "Làm việc" },
  { key: "sales", label: "Bán hàng" },
  { key: "insight", label: "Theo dõi" },
  { key: "admin", label: "Quản trị" },
];

export interface NavTab {
  href: string;
  label: string;
  section: NavSection;
  anyOf: string[];
  ready: boolean;
  /** Tab gom nhiều màn hình: hiện thành tab con, mỗi tab con theo quyền riêng. */
  children?: { href: string; label: string; perm: string }[];
}

export const NAV_TABS: NavTab[] = [
  {
    href: "/home",
    label: "Trang chủ",
    section: "work",
    anyOf: ["lead.view_own", "lead.view_all"],
    ready: true,
  },
  {
    href: "/tasks",
    label: "Việc cần làm",
    section: "work",
    anyOf: ["lead.view_own", "lead.view_all"],
    ready: true,
  },
  {
    href: "/opportunities",
    label: "Cơ hội",
    section: "sales",
    anyOf: ["lead.view_own", "lead.view_all"],
    ready: true,
  },
  {
    href: "/households",
    label: "Hộ gia đình",
    section: "sales",
    anyOf: ["lead.view_own", "lead.view_all"],
    ready: true,
  },
  {
    href: "/orders",
    label: "Đơn hàng",
    section: "sales",
    anyOf: ["order.view_own", "order.view_all"],
    ready: true,
  },
  {
    href: "/inbox",
    label: "Hội thoại",
    section: "work",
    anyOf: ["message.zalo_send", "message.view_all"],
    ready: true,
  },
  { href: "/channels", label: "Kênh & nội dung", section: "insight", anyOf: ["report.team"], ready: true },
  {
    href: "/reports",
    label: "Báo cáo",
    section: "insight",
    anyOf: ["report.own", "report.team"],
    ready: true,
  },
  { href: "/agents", label: "Agent", section: "admin", anyOf: ["settings.integrations"], ready: true },
  {
    href: "/products",
    label: "Sản phẩm",
    section: "sales",
    anyOf: ["product.view", "inventory.view", "policy.view"],
    ready: true,
    children: [
      { href: "/products", label: "Sản phẩm", perm: "product.view" },
      { href: "/inventory", label: "Kho", perm: "inventory.view" },
      { href: "/policies", label: "Chính sách", perm: "policy.view" },
    ],
  },
  { href: "/team", label: "Đội ngũ", section: "insight", anyOf: ["kpi.own", "kpi.team"], ready: true },
  {
    href: "/customers",
    label: "Khách",
    section: "sales",
    anyOf: ["lead.view_own", "lead.view_all"],
    ready: true,
  },
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
  { href: "/settings/shifts", label: "Ca trực", perm: "settings.assignment" },
  { href: "/settings/assignment", label: "Phân lead", perm: "settings.assignment" },
  { href: "/settings/markets", label: "Thị trường", perm: "settings.assignment" },
  { href: "/settings/task-rules", label: "Luật sinh việc", perm: "settings.assignment" },
  { href: "/settings/call-mode", label: "Chế độ gọi", perm: "settings.integrations" },
  { href: "/settings/catalog", label: "Danh mục", perm: "catalog.manage" },
  { href: "/settings/integrations", label: "Tích hợp", perm: "settings.integrations" },
  { href: "/settings/audit", label: "Nhật ký kiểm toán", perm: "audit.view" },
];

export function visibleTabs(perms: ReadonlySet<string>): NavTab[] {
  return NAV_TABS.filter((t) => t.ready && t.anyOf.some((p) => perms.has(p)))
    .map((t) => {
      if (!t.children) return t;
      // Tab gom: chỉ giữ tab con có quyền, tab chính trỏ tới tab con đầu tiên được xem.
      const children = t.children.filter((c) => perms.has(c.perm));
      return { ...t, href: children[0].href, children };
    })
    .map((t) =>
      // Telesale thấy tab Đội ngũ với tên "Hiệu suất của tôi" (DESIGN.md 4).
      t.href === "/team" && !perms.has("kpi.team") ? { ...t, label: "Hiệu suất của tôi" } : t,
    );
}

export function visibleSettings(perms: ReadonlySet<string>): SettingsItem[] {
  return SETTINGS_ITEMS.filter((s) => perms.has(s.perm));
}
