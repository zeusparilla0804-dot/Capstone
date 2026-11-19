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
const { renderEmail } = await import('../templates/email-templates.js');

function fixture(status = 'CONFIRMED', currentTime: string | null = '18:00', bookedOnTarget = 0, cashPaid?: number) {
  const calls: { command: string; params: Record<string, unknown> }[] = [];
  const params: Record<string, unknown> = {};
  const request = {
    replaceInput(name: string, _type: unknown, value: unknown) { params[name] = value; return this; },
    async query(command: string) {
      calls.push({ command, params: { ...params } });
      let recordset: unknown[] = [];
      if (command.includes('COUNT_BIG(*)')) recordset = [{ activeBookingCount: bookedOnTarget, largestGuestCount: 100 }];
      else if (command.includes('FROM dbo.PAYMENT WITH')) recordset = cashPaid === undefined ? [] : [{ amountPaid: cashPaid, amountDue: 100000, paymentMethod: 'CASH' }];
      else if (command.includes('JOIN dbo.CUSTOMER')) recordset = [{
        customerEmail: 'customer@example.test', customerName: 'Test Customer', bookingReference: 'BK-42', eventDate: '2026-11-21',
      }];
      else if (command.includes('INSERT dbo.EMAIL_OUTBOX')) recordset = [{ id: '125' }];
      else if (command.includes('SELECT')) recordset = [{ status, eventTime: currentTime, eventDate: '2026-11-28', guestCount: 100 }];
      return { recordset, rowsAffected: [1] };
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

const schedule = { expectedDate: '2026-11-28', expectedTime: '18:00', eventDate: '2026-11-21', eventTime: '21:00' };

test('rescheduling locks available capacity and updates the outstanding invoice and customer notification', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-19T04:00:00Z') });
  const { service, calls } = fixture();
  assert.deepEqual(await service.reschedule(7, 42, schedule), { eventDate: '2026-11-21', eventTime: '21:00' });
  const capacity = calls.findIndex(call => /COUNT_BIG\(\*\)/.test(call.command));
  const update = calls.findIndex(call => /UPDATE dbo.RESERVATION/.test(call.command));
  assert.ok(capacity > 0 && update > capacity);
  assert.match(calls[capacity]!.command, /UPDLOCK,HOLDLOCK/);
  assert.equal(calls[capacity]!.params['excludeReservationId'], 42);
  assert.ok(calls.some(call => /UPDATE dbo.INVOICE/.test(call.command)));
  assert.ok(calls.some(call => call.params['auditAction'] === 'BOOKING_RESCHEDULED'));
  const outbox = calls.find(call => /INSERT dbo.EMAIL_OUTBOX/.test(call.command))!;
  assert.equal(outbox.params['templateKey'], 'BOOKING_RESCHEDULED');
  const payload = JSON.parse(String(outbox.params['payload']));
  assert.equal(payload.eventTime, '21:00');
  assert.equal(payload.eventDate, '2026-11-21');
  assert.match(renderEmail('BOOKING_RESCHEDULED', payload).text, /Event time: 9:00 PM/);
  assert.ok(!calls.some(call => /UPDATE dbo.PAYMENT/.test(call.command)));
});

test('replaying the same new schedule does not enqueue a second notification', async () => {
  const { service, calls } = fixture();
  await service.reschedule(7, 42, { ...schedule, eventDate: '2026-11-28', eventTime: '18:00' });
  assert.equal(calls.length, 1);
});

test('rescheduling rejects full dates, stale dates, and passed cash deposit deadlines before writing', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-19T04:00:00Z') });
  for (const scenario of [
    { db: fixture('CONFIRMED', '18:00', 6), data: schedule, code: 'BOOKING_DATE_FULL' },
    { db: fixture(), data: { ...schedule, expectedDate: '2026-11-29' }, code: 'BOOKING_SCHEDULE_STALE' },
    { db: fixture('AWAITING_PAYMENT', '18:00', 0, 10000), data: schedule, code: 'CASH_PAYMENT_WINDOW_UNAVAILABLE' },
    { db: fixture(), data: { ...schedule, eventDate: '2026-11-19', eventTime: '11:59' }, code: 'EVENT_DATE_PASSED' },
  ]) {
    await assert.rejects(scenario.db.service.reschedule(7, 42, scenario.data), { code: scenario.code });
    assert.ok(scenario.db.calls.every(call => !/UPDATE dbo\.|INSERT dbo\./.test(call.command)));
  }
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
