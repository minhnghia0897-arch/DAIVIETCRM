/** Một thông báo trên chuông (bảng notifications). Không chứa số điện thoại hay nội dung tin nhắn. */
export interface Notice {
  id: string;
  type: string;
  title: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export interface NoticeFeed {
  items: Notice[];
  unread: number;
}
