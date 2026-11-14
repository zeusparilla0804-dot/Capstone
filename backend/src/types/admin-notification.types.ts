export interface AdminNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  reference: string;
  createdAt: string | null;
  isRead: boolean;
  link: string;
}

export interface AdminNotificationQuery {
  page: number;
  pageSize: number;
  unreadOnly: boolean;
}

export interface AdminNotificationPage {
  items: AdminNotification[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  unreadCount: number;
}

export interface AdminNotificationRepository {
  list(adminId: number, query: AdminNotificationQuery): Promise<AdminNotificationPage>;
  markRead(adminId: number, ids: readonly string[]): Promise<void>;
  markAllRead(adminId: number): Promise<void>;
}
