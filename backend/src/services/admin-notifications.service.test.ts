import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost'; process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test'; process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';

test('admin notification service validates pagination and deduplicates explicit read selections', async () => {
  assert.ok(existsSync(new URL('./admin-notifications.service.ts', import.meta.url)), 'notification service must exist');
  const { createAdminNotificationService } = await import('./admin-notifications.service.js');
  const calls: unknown[][] = [];
  const repository = { async list(...args: unknown[]) { calls.push(args); return { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0, unreadCount: 0 }; },
    async markRead(...args: unknown[]) { calls.push(args); }, async markAllRead(...args: unknown[]) { calls.push(args); } };
  const service = createAdminNotificationService(repository);
  await service.list(7, {});
  assert.deepEqual(calls.pop(), [7, { page: 1, pageSize: 20, unreadOnly: false }]);
  await service.list(7, { page: '2', pageSize: '50', unreadOnly: 'true', month: '2020-01' });
  assert.deepEqual(calls.pop(), [7, { page: 2, pageSize: 50, unreadOnly: true }]);
  for (const query of [{ page: '0' }, { page: '1.2' }, { page: ['1'] }, { page: '1e3' }, { page: '999999999999999999' },
    { pageSize: '101' }, { pageSize: '0' }, { unreadOnly: 'yes' }, { unreadOnly: ['true'] }]) {
    await assert.rejects(() => service.list(7, query), { statusCode: 400 });
  }
  await service.markRead(7, { ids: ['proof:2', 'proof:2'], adminId: 99 });
  assert.deepEqual(calls.pop(), [7, ['proof:2']]);
  for (const body of [null, {}, { ids: 'proof:2' }, { ids: [1] }, { ids: [''] }, { ids: ['x'.repeat(121)] }, { ids: Array(51).fill('proof:2') }]) {
    await assert.rejects(() => service.markRead(7, body), { statusCode: 400 });
  }
  await service.markRead(7, { ids: [] });
  assert.deepEqual(calls.pop(), [7, []]);
  await service.markAllRead(7);
  assert.deepEqual(calls.pop(), [7]);
});
