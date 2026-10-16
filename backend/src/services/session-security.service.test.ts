import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const authModule = await import('./auth.service.js');

test('session security revokes only the authenticated principal session family', async () => {
  const createService = (authModule as unknown as Record<string, unknown>)['createSessionSecurityService'];
  assert.equal(typeof createService, 'function');

  const calls: Array<[string, number?]> = [];
  const service = (createService as Function)({
    deleteCustomerSessions: async (id: number) => { calls.push(['customer', id]); },
    deleteAdminSessions: async (id: number) => { calls.push(['admin', id]); },
    deleteExpiredSessions: async () => { calls.push(['cleanup']); return { customers: 2, administrators: 1 }; },
  });

  await service.logoutAllCustomerSessions(42);
  await service.logoutAllAdminSessions(7);
  assert.deepEqual(await service.cleanupExpiredSessions(), { customers: 2, administrators: 1 });
  assert.deepEqual(calls, [['customer', 42], ['admin', 7], ['cleanup']]);
});

test('session cleanup worker starts once, avoids overlap, and waits when stopped', async () => {
  const createWorker = (authModule as unknown as Record<string, unknown>)['createSessionCleanupWorker'];
  assert.equal(typeof createWorker, 'function');

  let finishCleanup!: () => void;
  let cleanupCalls = 0;
  const scheduled: Array<() => void> = [];
  let cancelled = 0;
  const worker = (createWorker as Function)({
    cleanup: async () => {
      cleanupCalls++;
      await new Promise<void>(resolve => { finishCleanup = resolve; });
    },
    intervalMs: 60_000,
    schedule: (callback: () => void) => { scheduled.push(callback); return callback; },
    cancel: () => { cancelled++; },
  });

  worker.start();
  worker.start();
  await Promise.resolve();
  assert.equal(cleanupCalls, 1);

  const stopping = worker.stop();
  let stopped = false;
  void stopping.then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  finishCleanup();
  await stopping;
  assert.equal(stopped, true);
  assert.equal(scheduled.length, 0);
  assert.equal(cancelled, 0);
});
