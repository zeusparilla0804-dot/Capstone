import assert from 'node:assert/strict';
import test from 'node:test';
import type sql from 'mssql';

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

const repositoryModule = await optional('./event-reminder.repository.js');

function requestHarness(rows: unknown[] = [], affected = 0) {
  const parameters: Record<string, unknown> = {};
  let command = '';
  const request = {
    replaceInput(name: string, _type: unknown, value: unknown) { parameters[name] = value; return request; },
    async query(sqlText: string) { command = sqlText; return { recordset: rows, rowsAffected: [affected] }; }
  } as unknown as sql.Request;
  return { request, parameters, command: () => command };
}

test('event reminder repository queues one intent per confirmed booking with serializable duplicate protection', async () => {
  assert.equal(typeof repositoryModule?.createEventReminderRepository, 'function');
  const db = requestHarness([], 2);
  let transactional = false;
  const repository = repositoryModule!.createEventReminderRepository({
    transaction: async (work: (request: sql.Request) => Promise<unknown>) => {
      transactional = true;
      return work(db.request);
    },
    readRequest: async () => db.request
  });
  assert.equal(await repository.queueDue('2026-10-17', '2026-10-20'), 2);
  assert.equal(transactional, true);
  assert.deepEqual(db.parameters, {
    fromDate: '2026-10-17',
    throughDate: '2026-10-20',
    templateKey: 'UPCOMING_EVENT_REMINDER',
    relatedEntityType: 'BOOKING'
  });
  assert.match(db.command(), /r\.status\s*=\s*'CONFIRMED'/i);
  assert.match(db.command(), /c\.status\s*=\s*'ACTIVE'/i);
  assert.match(db.command(), /r\.event_date\s+BETWEEN\s+@fromDate\s+AND\s+@throughDate/i);
  assert.match(db.command(), /NOT\s+EXISTS/i);
  assert.match(db.command(), /EMAIL_OUTBOX\s+existing\s+WITH\s*\(UPDLOCK,HOLDLOCK\)/i);
  assert.match(db.command(), /related_entity_id\s*=\s*r\.reservation_id/i);
});

test('event reminder delivery revalidation requires the same confirmed future reservation date', async () => {
  assert.equal(typeof repositoryModule?.createEventReminderRepository, 'function');
  const db = requestHarness([{ deliverable: 1 }], 1);
  const repository = repositoryModule!.createEventReminderRepository({
    transaction: async (work: (request: sql.Request) => Promise<unknown>) => work(db.request),
    readRequest: async () => db.request
  });
  assert.equal(await repository.isDeliverable(7, '2026-10-20', '2026-10-17'), true);
  assert.deepEqual(db.parameters, { reservationId: 7, eventDate: '2026-10-20', today: '2026-10-17' });
  assert.match(db.command(), /JOIN\s+dbo\.CUSTOMER\s+c\s+ON\s+c\.customer_id\s*=\s*r\.customer_id/i);
  assert.match(db.command(), /c\.status\s*=\s*'ACTIVE'/i);
  assert.match(db.command(), /status\s*=\s*'CONFIRMED'/i);
  assert.match(db.command(), /event_date\s*=\s*@eventDate/i);
  assert.match(db.command(), /event_date\s*>=\s*@today/i);
});
