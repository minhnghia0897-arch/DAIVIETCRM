// Kiểu dùng chung cho server và bản demo tĩnh.
export interface SessionUser {
  id: string;
  email: string | null;
  fullName: string;
  showroomId: string;
  showroomName: string;
  roleName: string;
  permissions: ReadonlySet<string>;
  /** Có khi Owner đang "Xem như" người này: mọi thao tác ghi bị chặn. */
  viewAs: { sessionId: string; ownerName: string } | null;
}
