// Tên loại việc trong `tasks` (CLAUDE.md mục 4). Không phụ thuộc gì để dùng được cả ở Next, script và bot Telegram.

export const TASK_TYPE_LABEL: Record<string, string> = {
  first_contact: "Liên hệ đầu tiên",
  callback: "Hẹn gọi lại",
  post_delivery_call: "Gọi hỏi thăm sau giao",
  consumable_reminder: "Nhắc thay lõi",
  occasion_reminder: "Nhắc dịp tặng",
  reactivation: "Làm nóng lại",
  delivery_step: "Bước giao lắp",
  warranty_followup: "Theo dõi bảo hành",
  data_fix: "Sửa dữ liệu",
};
