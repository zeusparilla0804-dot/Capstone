import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const [{ bookingService }, { updatePendingBooking }, { closeDatabase }, { parseAvailabilityQuery }] = await Promise.all([
  import('./booking.service.js'), import('../repositories/booking.repository.js'),
  import('../config/database.js'), import('../controllers/booking.controller.js'),
]);

test('availability accepts an optional positive reservation identifier for editing', () => {
  assert.deepEqual(parseAvailabilityQuery({ date: '2098-06-15', guestCount: '1000', reservationId: '42' }), {
    date: '2098-06-15', guestCount: 1000, reservationId: 42,
  });
  for (const reservationId of ['0', '-1', '1.5', ['42']]) {
    assert.throws(() => parseAvailabilityQuery({ date: '2098-06-15', guestCount: '1000', reservationId }));
  }
});

test('edit availability excludes only the authenticated customer pending reservation', async t => {
  let owned = true;
  let exclusion: unknown;
  const pool = { connected: true, close: async () => {}, request: () => new sql.Request() };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Request.prototype, 'query', async function(command: string) {
    const params = Object.fromEntries(Object.entries(this.parameters).map(([name, value]) => [name, value.value]));
    if (/COUNT_BIG/.test(command)) {
      exclusion = params['excludeReservationId'];
      return { recordset: [{ activeBookingCount: 0, largestGuestCount: 0, hasMediumEvent: 0 }], rowsAffected: [1] };
    }
    assert.equal(params['customerId'], 7);
    assert.match(command, /status\s*=\s*'PENDING'/i);
    return { recordset: owned ? [{ reservation_id: 42 }] : [], rowsAffected: [1] };
  });
  try {
    const result = await (bookingService.availability as any)('2098-06-15', 1000, 7, 42);
    assert.equal(result.status, 'LIMITED');
    assert.equal(exclusion, 42);
    owned = false;
    await assert.rejects((bookingService.availability as any)('2098-06-15', 1000, 7, 42), (error: any) => error.statusCode === 404);
  } finally { await closeDatabase(); }
});

test('pending cash edit validates the stored method when the request omits payment method', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-29T04:00:00Z') });
  const pool = { connected: true, close: async () => {} };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Transaction.prototype, 'begin', async function() { return this; });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => {});
  t.mock.method(sql.Request.prototype, 'query', async function(command: string) {
    if (/FROM dbo\.BOOKING_POLICY/.test(command)) return { recordset: [], rowsAffected: [0] };
    if (/FROM dbo\.RESERVATION r WITH/.test(command)) return {
      recordset: [{ reservation_id: 42, status: 'PENDING', payment_method: 'CASH', amount_paid: 0 }], rowsAffected: [1],
    };
    throw new Error('Cash timing must be validated before catalog lookup or any write.');
  });
  try {
    await assert.rejects(updatePendingBooking(7, 42, {
      eventType: 'wedding', eventDate: '2026-11-01', eventTime: '12:00', venue: 'Venue',
      guestCount: 501, packageId: 1, addOnIds: [],
    }), (error: any) => error.code === 'CASH_PAYMENT_WINDOW_UNAVAILABLE');
  } finally { await closeDatabase(); }
});
