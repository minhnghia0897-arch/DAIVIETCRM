// Kiểu dùng chung cho server và bản demo tĩnh.
export interface SessionUser {
  id: string;
  email: string | null;
  fullName: string;
  showroomId: string;
  showroomName: string;
  roleName: string;
  /** Khóa vai trò (owner, sale_admin, telesale…): chỉ dùng làm dữ liệu đầu vào như giới hạn giảm giá, không dùng để phân quyền. */
  roleKey: string;
  permissions: ReadonlySet<string>;
  /** Có khi Owner đang "Xem như" người này: mọi thao tác ghi bị chặn. */
  viewAs: { sessionId: string; ownerName: string } | null;
}
