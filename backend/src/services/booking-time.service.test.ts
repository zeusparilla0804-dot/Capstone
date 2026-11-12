import assert from 'node:assert/strict';
import test from 'node:test';
import type sql from 'mssql';
process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
const { createBookingTimeService } = await import('./booking-time.service.js');

function fixture(status = 'CONFIRMED', currentTime: string | null = '18:00') {
  const calls: { command: string; params: Record<string, unknown> }[] = [];
  const params: Record<string, unknown> = {};
  const request = {
    replaceInput(name: string, _type: unknown, value: unknown) { params[name] = value; return this; },
    async query(command: string) {
      calls.push({ command, params: { ...params } });
      return { recordset: command.includes('SELECT') ? [{ status, eventTime: currentTime }] : [], rowsAffected: [1] };
    },
  } as unknown as sql.Request;
  const service = createBookingTimeService(work => work(request));
  return { service, calls };
}

test('admin can change an active reservation to 10 PM with an audit and history entry', async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.update(7, 42, { eventTime: '22:00', expectedTime: '18:00' }), { eventTime: '22:00' });
  assert.match(calls[0]!.command, /UPDLOCK,HOLDLOCK/);
  const update = calls.find(call => /UPDATE dbo.RESERVATION/.test(call.command))!;
  assert.equal(update.params['eventTime'], '22:00');
  const history = calls.find(call => /INSERT dbo.BOOKING_STATUS_HISTORY/.test(call.command))!;
  assert.match(String(history.params['reason']), /6:00 PM.*10:00 PM/);
  const audit = calls.find(call => /INSERT dbo.ADMIN_AUDIT_LOG/.test(call.command))!;
  assert.equal(audit.params['auditAdminId'], 7);
  assert.deepEqual(JSON.parse(String(audit.params['auditOldValues'])), { eventTime: '18:00' });
  assert.deepEqual(JSON.parse(String(audit.params['auditNewValues'])), { eventTime: '22:00' });
});

test('event time edits reject invalid input, terminal states and stale values without a write', async () => {
  for (const value of ['24:00', '22:60', '10 PM', '', null]) {
    const { service, calls } = fixture();
    await assert.rejects(service.update(7, 42, { eventTime: value, expectedTime: '18:00' }), /valid event time/i);
    assert.equal(calls.length, 0);
  }
  for (const status of ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED']) {
    const { service, calls } = fixture(status);
    await assert.rejects(service.update(7, 42, { eventTime: '22:00', expectedTime: '18:00' }), /active reservation/i);
    assert.equal(calls.length, 1);
  }
  const { service, calls } = fixture('CONFIRMED', '19:00');
  await assert.rejects(service.update(7, 42, { eventTime: '22:00', expectedTime: '18:00' }), /changed.*refresh/i);
  assert.equal(calls.length, 1);
});

test('unchanged time does not create duplicate history or audit records', async () => {
  const { service, calls } = fixture();
  await service.update(7, 42, { eventTime: '18:00', expectedTime: '18:00' });
  assert.equal(calls.length, 1);
});
