import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

async function optional(path: string) {
  return import(path).catch(error => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return undefined;
  });
}

const reminderModule = await optional('./event-reminder.service.js');

test('event reminder window follows the Manila calendar across the UTC date boundary', () => {
  assert.equal(typeof reminderModule?.manilaReminderWindow, 'function');
  assert.deepEqual(reminderModule!.manilaReminderWindow(new Date('2026-10-16T15:30:00.000Z')), {
    fromDate: '2026-10-16',
    throughDate: '2026-10-19'
  });
  assert.deepEqual(reminderModule!.manilaReminderWindow(new Date('2026-10-16T16:30:00.000Z')), {
    fromDate: '2026-10-17',
    throughDate: '2026-10-20'
  });
});

test('event reminder worker queues immediately, avoids overlap, reports errors, and stops cleanly', async () => {
  assert.equal(typeof reminderModule?.createEventReminderWorker, 'function');
  const calls: Array<{ fromDate: string; throughDate: string }> = [];
  const scheduled: Array<() => void> = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let errors = 0;
  const worker = reminderModule!.createEventReminderWorker({
    queueDue: async (fromDate: string, throughDate: string) => {
      calls.push({ fromDate, throughDate });
      if (calls.length === 1) await gate;
      else throw new Error('database unavailable');
      return 1;
    },
    now: () => new Date('2026-10-16T16:30:00.000Z'),
    intervalMs: 60_000,
    schedule: (callback: () => void) => { scheduled.push(callback); return callback; },
    cancel: () => {},
    onError: () => { errors++; }
  });

  worker.start();
  worker.start();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls.length, 1);
  release();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(scheduled.length, 1);
  scheduled[0]!();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls.length, 2);
  assert.equal(errors, 1);
  assert.deepEqual(calls[0], { fromDate: '2026-10-17', throughDate: '2026-10-20' });
  await worker.stop();
});
