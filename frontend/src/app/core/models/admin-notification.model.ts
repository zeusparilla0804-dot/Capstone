export interface AdminNotification {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly reference: string;
  readonly createdAt: string | null;
  readonly isRead: boolean;
  readonly link: string;
}

export interface AdminNotificationPage {
  readonly items: readonly AdminNotification[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly unreadCount: number;
}
