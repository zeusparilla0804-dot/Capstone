import { adminNotificationRepository } from '../repositories/admin-notifications.repository.js';
import type { AdminNotificationRepository } from '../types/admin-notification.types.js';
import { AppError } from '../utils/app-error.js';

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new AppError(400, 'Invalid notification pagination.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > maximum) throw new AppError(400, 'Invalid notification pagination.');
  return number;
}

export function createAdminNotificationService(repository: AdminNotificationRepository) {
  return {
    async list(adminId: number, raw: Record<string, unknown>) {
      const pageSize = positiveInteger(raw['pageSize'], 20, 100);
      const page = positiveInteger(raw['page'], 1, Math.floor(2_147_483_647 / pageSize));
      const unread = raw['unreadOnly'];
      if (unread !== undefined && unread !== 'true' && unread !== 'false') throw new AppError(400, 'Invalid unread notification filter.');
      return repository.list(adminId, { page, pageSize, unreadOnly: unread === 'true' });
    },
    async markRead(adminId: number, raw: unknown) {
      const ids = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>)['ids'] : undefined;
      if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 120)) {
        throw new AppError(400, 'Invalid notification selection.');
      }
      await repository.markRead(adminId, [...new Set(ids as string[])]);
    },
  };
}

export const adminNotificationService = createAdminNotificationService(adminNotificationRepository);
