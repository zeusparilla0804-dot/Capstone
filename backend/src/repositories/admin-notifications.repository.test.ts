import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import type sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost'; process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test'; process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';

class Recorder {
  calls: { command: string; params: Record<string, unknown> }[] = [];
  params: Record<string, unknown> = {};
  constructor(readonly sets: Record<string, unknown>[][] = []) {}
  replaceInput(name: string, _type: unknown, value: unknown) { this.params[name] = value; return this; }
  async query(command: string) { this.calls.push({ command, params: { ...this.params } }); return { recordsets: this.sets }; }
}
async function create(request: Recorder) {
  assert.ok(existsSync(new URL('./admin-notifications.repository.ts', import.meta.url)), 'notification repository must exist');
  const { createAdminNotificationRepository } = await import('./admin-notifications.repository.js');
  return createAdminNotificationRepository({ request: async () => request as unknown as sql.Request });
}

test('admin feed uses complete stable ordered sources, global unread metadata and safe proof links', async () => {
  const request = new Recorder([[{ totalItems: 51, unreadCount: 70 }], [
    { id: 'transaction:7', type: 'PAYMENT_VERIFIED', title: 'Payment proof verified', message: 'Recorded payment', reference: 'BK-42',
      createdAt: new Date('2026-11-14T01:00:00Z'), isRead: false, link: '/admin/payments/proofs/9' },
    { id: 'time:8', type: 'EVENT_TIME_UPDATED', title: 'Event time adjusted by admin', message: 'BK-42 · 13:00 → 18:00', reference: 'BK-42',
      createdAt: new Date('2026-11-14T00:00:00Z'), isRead: true, link: '/admin/bookings/42', payload: 'private', storage_key: 'secret' },
    { id: 'L-8', type: 'ADMIN_MESSAGE', title: 'Administrator notification', message: 'A directed pending message', reference: 'BK-42',
      createdAt: null, isRead: false, link: '/admin/bookings/42' },
  ]]);
  const repository = await create(request);
  const result = await repository.list(7, { page: 2, pageSize: 20, unreadOnly: true });
  assert.deepEqual({ ...result, items: undefined }, { items: undefined, page: 2, pageSize: 20, totalItems: 51, totalPages: 3, unreadCount: 70 });
  assert.equal(result.items[0]?.link, '/admin/payments/proofs/9');
  assert.equal(result.items[0]?.createdAt, '2026-11-14T01:00:00.000Z');
  assert.equal(result.items[2]?.createdAt, null, 'undated legacy messages remain accessible without inventing a date');
  assert.match(result.items[1]!.message, /1:00 PM → 6:00 PM/);
  assert.deepEqual(Object.keys(result.items[1]!).sort(), ['id', 'type', 'title', 'message', 'reference', 'createdAt', 'isRead', 'link'].sort());
  const { command, params } = request.calls[0]!;
  assert.deepEqual(params, { adminId: 7, unreadOnly: true, offset: 20, pageSize: 20 });
  assert.match(command, /ORDER BY createdAt DESC,id DESC/);
  assert.match(command, /DECLARE @notificationFeed TABLE\s*\(/, 'metadata and page rows must share one captured feed');
  assert.match(command, /createdAt datetime2 NULL/);
  assert.match(command, /message nvarchar\(max\)/);
  assert.equal((command.match(/WITH feed AS/g) ?? []).length, 1, 'capture the source union exactly once');
  assert.match(command, /INSERT INTO @notificationFeed\s*\(id,type,title,message,reference,createdAt,isRead,link\)/);
  assert.equal((command.match(/FROM @notificationFeed/g) ?? []).length, 2, 'both global counts and page rows must read the captured feed');
  assert.match(command, /OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY/);
  assert.match(command, /SUM\(CASE WHEN isRead=0 THEN 1 ELSE 0 END\)/);
  assert.match(command, /SUM\(CASE WHEN @unreadOnly=0 OR isRead=0 THEN 1 ELSE 0 END\)/);
  assert.match(command, /seen.admin_id=@adminId/);
  assert.match(command, /n.recipient_type='ADMIN' AND n.recipient_id=@adminId/);
  assert.doesNotMatch(command, /n.sent_at IS NOT NULL/);
  assert.match(command, /h.previous_status IS NOT NULL/);
  assert.match(command, /COALESCE\(h.reason,''\) LIKE 'Event time adjusted from %'/, 'admin status changes with a NULL reason must remain in the feed');
  assert.match(command, /h.next_status='PAYMENT_SUBMITTED'.*EXISTS/s);
  assert.match(command, /OUTER APPLY\s*\(SELECT TOP\(1\) pp.payment_proof_id/s);
  assert.match(command, /pp.payment_transaction_id=pt.payment_transaction_id/);
  assert.match(command, /DATEADD\(minute,-@serverOffset,pt.created_at\)/);
  assert.match(command, /'proof:',pp.payment_proof_id/);
  assert.match(command, /'rejection:',pp.payment_proof_id/);
  assert.match(command, /'superseded:',pp.payment_proof_id/);
  assert.match(command, /'email-failure:',o.notification_id,':',o.attempt_count/);
  assert.doesNotMatch(command, /o\.template_key\s+(?:NOT\s+)?IN|o\.template_key\s*=/, 'failed verification/reset delivery is also an admin operational notification');
  assert.doesNotMatch(command, /JOIN dbo.PAYMENT_PROOF pp ON pp.payment_transaction_id/);
  assert.doesNotMatch(command, /periodStart|periodEnd|CUSTOM_EVENT|E_WALLET|storage_key|o.payload|last_error/);
});

test('empty later pages retain global counts and read writes validate against the complete scoped feed atomically', async () => {
  const request = new Recorder([[{ totalItems: 2, unreadCount: 8 }], []]);
  const repository = await create(request);
  const result = await repository.list(8, { page: 9, pageSize: 20, unreadOnly: true });
  assert.deepEqual(result, { items: [], page: 9, pageSize: 20, totalItems: 2, totalPages: 1, unreadCount: 8 });
  request.calls = [];
  request.params = {};
  await repository.markRead(8, ['proof:99', "legacy:8');DELETE", 'proof:99']);
  assert.equal(request.calls.length, 1);
  const { command, params } = request.calls[0]!;
  assert.deepEqual(params, { adminId: 8, key0: 'proof:99', key1: "legacy:8');DELETE" });
  assert.doesNotMatch(command, /legacy:8'|\bOFFSET\b|FETCH NEXT/);
  assert.match(command, /MERGE dbo.ADMIN_NOTIFICATION_READ WITH\(HOLDLOCK\)/);
  assert.match(command, /JOIN feed f ON f.id=v.notification_key/);
  assert.match(command, /target.admin_id=source.admin_id AND target.notification_key=source.notification_key/);
  assert.match(command, /WHEN NOT MATCHED THEN INSERT\(admin_id,notification_key\)/);
  assert.doesNotMatch(command, /WHEN MATCHED|UPDATE dbo.RESERVATION|UPDATE dbo.PAYMENT/);
  request.calls = [];
  await repository.markRead(8, []);
  assert.equal(request.calls.length, 0);
});

test('mark all read captures the entire current admin feed and only inserts missing read markers', async () => {
  const request = new Recorder();
  const repository = await create(request);
  await repository.markAllRead(8);
  assert.equal(request.calls.length, 1);
  const { command, params } = request.calls[0]!;
  assert.deepEqual(params, { adminId: 8 });
  assert.match(command, /WITH feed AS/);
  assert.match(command, /n.recipient_type='ADMIN' AND n.recipient_id=@adminId/);
  assert.match(command, /SELECT DISTINCT @adminId admin_id,id notification_key FROM feed/);
  assert.match(command, /MERGE dbo.ADMIN_NOTIFICATION_READ WITH\(HOLDLOCK\)/);
  assert.match(command, /target.admin_id=source.admin_id AND target.notification_key=source.notification_key/);
  assert.match(command, /WHEN NOT MATCHED THEN INSERT\(admin_id,notification_key\)/);
  assert.doesNotMatch(command, /\bOFFSET\b|FETCH NEXT|WHEN MATCHED|DELETE\s+FROM|UPDATE dbo\./);
});
