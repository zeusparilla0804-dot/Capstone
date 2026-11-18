export type NotificationReadStatus = 'all' | 'unread' | 'read';
export type NotificationCategory = 'all' | 'reservations' | 'payments' | 'customers' | 'system';

export const notificationReadFilters: readonly { value: NotificationReadStatus; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }, { value: 'read', label: 'Read' },
];
export const notificationCategories: readonly { value: NotificationCategory; label: string }[] = [
  { value: 'all', label: 'All types' }, { value: 'reservations', label: 'Reservations' },
  { value: 'payments', label: 'Payments' }, { value: 'customers', label: 'Customers' }, { value: 'system', label: 'Other / System' },
];

export function notificationCategory(type: string): NotificationCategory {
  if (type.startsWith('PAYMENT_') || type === 'INVOICE_ISSUED') return 'payments';
  if (type.startsWith('BOOKING_') || type.startsWith('RESERVATION_') || type === 'EVENT_TIME_UPDATED' || type === 'UPCOMING_EVENT_REMINDER') return 'reservations';
  if (type.startsWith('CUSTOMER_')) return 'customers';
  return 'system';
}
