import type { LiveGroup } from "@/components/crm/views/telegram-groups";

// Nhóm Telegram giả cho bản demo tĩnh: một nhóm CRM đang đăng tin, một nhóm giao hàng, một nhóm bot vừa được
// thêm vào chưa gán việc, và một nhóm bot đã bị đưa ra. Không có nội dung trò chuyện vì CRM không đọc
// (CLAUDE.md mục 10.3): bot giữ chế độ riêng tư, không làm quản trị nhóm.

/** Giờ cố định để bản demo tĩnh chụp lại lúc nào cũng giống nhau. */
const at = (daysAgo: number, hhmm: string) => {
  const d = new Date("2026-10-06T00:00:00+07:00");
  d.setDate(d.getDate() - daysAgo);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const DEMO_TELEGRAM_GROUPS: LiveGroup[] = [
  {
    chatId: "-1001000000001",
    title: "Cả đội Showroom Q4",
    purpose: "announce",
    status: "active",
    assignedBy: "Hà Owner",
    assignedAt: at(3, "09:10"),
    posts: [
      { at: at(0, "08:05"), eventType: "lead_created" },
      { at: at(0, "07:20"), eventType: "lead_created" },
      { at: at(1, "16:42"), eventType: "lead_created" },
    ],
  },
  {
    chatId: "-1001000000002",
    title: "Kho & giao lắp",
    purpose: "delivery",
    status: "active",
    assignedBy: "Hà Owner",
    assignedAt: at(2, "08:20"),
    posts: [],
  },
  {
    chatId: "-1001000000003",
    title: "Telesale",
    purpose: "unused",
    status: "pending",
    assignedBy: null,
    assignedAt: null,
    posts: [],
  },
  {
    chatId: "-1001000000004",
    title: "Nhóm cũ 2025",
    purpose: "general",
    status: "lost",
    assignedBy: "Hà Owner",
    assignedAt: at(60, "10:00"),
    posts: [],
  },
];
