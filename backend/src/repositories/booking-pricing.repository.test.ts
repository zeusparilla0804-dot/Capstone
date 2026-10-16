import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const [bookingRepository, { closeDatabase }] = await Promise.all([
  import('./booking.repository.js'),
  import('../config/database.js'),
]);
const { createBooking } = bookingRepository;

test('booking creation persists an immutable base-plus-excess pricing snapshot', async (t) => {
  let active = false;
  let reservationCommand = '';
  let reservationParameters: Record<string, unknown> = {};
  const pool = { connected: true, close: async () => {} };

  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Transaction.prototype, 'begin', async function () { active = true; return this; });
  t.mock.method(sql.Transaction.prototype, 'commit', async () => { active = false; });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { active = false; });
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    assert.ok(active, 'booking creation must remain inside its transaction');
    const parameters = Object.fromEntries(
      Object.entries(this.parameters).map(([name, parameter]) => [name, parameter.value]),
    );
    const result = (recordset: unknown[] = []) => ({ recordset, rowsAffected: [1] });

    if (/FROM dbo\.PACKAGE p/.test(command)) {
      return result([{
        package_id: 8,
        package_name: 'Amethyst Package',
        description: 'Debut package',
        pricing_type: 'BASE_PLUS_EXCESS',
        price_per_head: null,
        base_price: 85_888,
        included_guests: 50,
        excess_guest_price: 650,
        min_guest: null,
        max_guest: null,
        event_type: 'Debut',
      }]);
    }
    if (/COUNT_BIG\s*\(\s*\*\s*\).*FROM dbo\.RESERVATION/is.test(command)) {
      return result([{ activeBookingCount: 0, largestGuestCount: 0, hasMediumEvent: 0 }]);
    }
    if (/SELECT event_id/.test(command)) return result([{ event_id: 4 }]);
    if (/INSERT dbo\.RESERVATION/.test(command)) {
      reservationCommand = command;
      reservationParameters = parameters;
      return result([{ reservation_id: 31, created_at: new Date('2026-10-12T06:00:00.000Z') }]);
    }
    if (/INSERT dbo\.PAYMENT/.test(command)) return result();
    if (/email outbox context.*customerEmail.*FROM dbo\.RESERVATION/is.test(command)) {
      return result([{
        customerEmail: 'customer@example.test',
        customerName: 'Customer',
        bookingReference: 'BK-31',
        eventDate: '2026-12-20',
        invoiceNumber: null,
      }]);
    }
    if (/INSERT dbo\.EMAIL_OUTBOX/.test(command)) return result([{ id: '41' }]);
    throw new Error(`Unexpected query: ${command}`);
  });

  try {
    const booking = await createBooking(7, {
      eventType: 'Debut',
      eventDate: '2026-12-20',
      eventTime: '18:00',
      venue: 'Panorama Ville',
      guestCount: 51,
      packageId: 8,
      addOnIds: [],
      paymentMethod: 'cash',
      specialRequest: 'No shellfish.',
    });

    assert.match(reservationCommand, /package_pricing_type/i);
    assert.match(reservationCommand, /package_name_snapshot/i);
    assert.match(reservationCommand, /package_base_price/i);
    assert.match(reservationCommand, /package_included_guests/i);
    assert.match(reservationCommand, /package_excess_guest_price/i);
    assert.match(reservationCommand, /package_total/i);
    assert.match(reservationCommand, /special_request/i);
    assert.equal(reservationParameters['pricingType'], 'BASE_PLUS_EXCESS');
    assert.equal(reservationParameters['packageName'], 'Amethyst Package');
    assert.equal(reservationParameters['unitPrice'], null);
    assert.equal(reservationParameters['basePrice'], 85_888);
    assert.equal(reservationParameters['includedGuests'], 50);
    assert.equal(reservationParameters['excessGuestPrice'], 650);
    assert.equal(reservationParameters['packageTotal'], 86_538);
    assert.equal(reservationParameters['specialRequest'], 'No shellfish.');
    assert.equal(reservationParameters['subtotal'], 86_538);
    assert.equal(reservationParameters['total'], 86_538);
    assert.deepEqual(booking.package, {
      packageId: 8,
      packageName: 'Amethyst Package',
      pricingType: 'BASE_PLUS_EXCESS',
      pricePerGuest: null,
      basePrice: 85_888,
      includedGuests: 50,
      excessGuestPrice: 650,
      packageTotal: 86_538,
    });
    assert.equal(booking.specialRequest, 'No shellfish.');
  } finally {
    await closeDatabase();
  }
});

test('pending booking edit is owner-scoped, recalculates pricing, and replaces add-ons atomically', async (t) => {
  let active = false;
  let updateCommand = '';
  let updateParameters: Record<string, unknown> = {};
  let capacityParameters: Record<string, unknown> = {};
  const writes: string[] = [];
  const pool = { connected: true, close: async () => {} };

  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Transaction.prototype, 'begin', async function () { active = true; return this; });
  t.mock.method(sql.Transaction.prototype, 'commit', async () => { active = false; });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { active = false; });
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    assert.ok(active, 'pending edit must remain inside its transaction');
    const parameters = Object.fromEntries(
      Object.entries(this.parameters).map(([name, parameter]) => [name, parameter.value]),
    );
    const result = (recordset: unknown[] = [], rowsAffected = [1]) => ({ recordset, rowsAffected });

    if (/FROM dbo\.RESERVATION r WITH\s*\(UPDLOCK,HOLDLOCK\)/i.test(command)) {
      assert.match(command, /r\.customer_id\s*=\s*@customerId/i);
      return result([{
        reservation_id: 31,
        status: 'PENDING',
        booking_reference: 'BK-2026-EDIT',
        created_at: new Date('2026-10-01T06:00:00.000Z'),
        discount_amount: 0,
        amount_paid: 0,
        invoice_id: null,
      }]);
    }
    if (/FROM dbo\.PACKAGE p/.test(command)) {
      return result([{
        package_id: 2,
        package_name: 'Premium Buffet',
        description: 'Premium package',
        pricing_type: 'PER_HEAD',
        price_per_head: 580,
        base_price: null,
        included_guests: null,
        excess_guest_price: null,
        min_guest: null,
        max_guest: null,
        event_type: 'Wedding',
      }]);
    }
    if (/COUNT_BIG\s*\(\s*\*\s*\).*FROM dbo\.RESERVATION/is.test(command)) {
      capacityParameters = parameters;
      assert.match(command, /reservation_id\s*<>\s*@excludeReservationId/i);
      return result([{ activeBookingCount: 1, largestGuestCount: 80, hasMediumEvent: 0 }]);
    }
    if (/FROM dbo\.ADD_ON/.test(command)) {
      return result([{ add_on_id: 5, add_on_name: 'Coffee Bar', description: '50 cups', price: 15_000 }]);
    }
    if (/SELECT event_id/.test(command)) return result([{ event_id: 1 }]);
    if (/UPDATE dbo\.RESERVATION/.test(command)) {
      updateCommand = command;
      updateParameters = parameters;
      writes.push('reservation');
      return result();
    }
    if (/DELETE FROM dbo\.RESERVATION_ADD_ON/.test(command)) { writes.push('delete-add-ons'); return result(); }
    if (/INSERT dbo\.RESERVATION_ADD_ON/.test(command)) { writes.push('insert-add-on'); return result(); }
    if (/UPDATE dbo\.PAYMENT/.test(command)) { writes.push('payment'); return result(); }
    throw new Error(`Unexpected query: ${command}`);
  });

  try {
    const update = (bookingRepository as typeof bookingRepository & {
      updatePendingBooking: (customerId: number, reservationId: number, dto: Record<string, unknown>) => Promise<any>;
    }).updatePendingBooking;
    const booking = await update(7, 31, {
      eventType: 'Wedding',
      eventDate: '2026-12-22',
      eventTime: '13:00',
      venue: 'New venue',
      guestCount: 100,
      packageId: 2,
      addOnIds: [5],
      paymentMethod: 'bank-transfer',
      specialRequest: 'Use white linens.',
    });

    assert.equal(capacityParameters['excludeReservationId'], 31);
    assert.match(updateCommand, /status\s*=\s*'PENDING'/i);
    assert.equal(updateParameters['packageTotal'], 58_000);
    assert.equal(updateParameters['subtotal'], 73_000);
    assert.equal(updateParameters['total'], 73_000);
    assert.deepEqual(writes, ['reservation', 'delete-add-ons', 'insert-add-on', 'payment']);
    assert.equal(booking.total, 73_000);
    assert.equal(booking.package.packageTotal, 58_000);
    assert.equal(booking.specialRequest, 'Use white linens.');
  } finally {
    await closeDatabase();
  }
});

test('pending booking edit rejects a non-owned or non-pending reservation before writes', async (t) => {
  const pool = { connected: true, close: async () => {} };
  let active = false;
  let writes = 0;
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Transaction.prototype, 'begin', async function () { active = true; return this; });
  t.mock.method(sql.Transaction.prototype, 'commit', async () => { active = false; });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { active = false; });
  t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
    assert.ok(active);
    if (/FROM dbo\.RESERVATION r WITH\s*\(UPDLOCK,HOLDLOCK\)/i.test(command)) {
      return { recordset: [{ reservation_id: 31, status: 'APPROVED' }], rowsAffected: [1] };
    }
    writes += 1;
    throw new Error(`Unexpected write: ${command}`);
  });

  try {
    const update = (bookingRepository as typeof bookingRepository & {
      updatePendingBooking: (customerId: number, reservationId: number, dto: Record<string, unknown>) => Promise<any>;
    }).updatePendingBooking;
    await assert.rejects(
      update(7, 31, {
        eventType: 'Wedding', eventDate: '2026-12-22', eventTime: '13:00', venue: 'Venue',
        guestCount: 100, packageId: 2, addOnIds: [],
      }),
      (error: unknown) => typeof error === 'object' && error !== null
        && 'statusCode' in error && error.statusCode === 409
        && 'code' in error && error.code === 'BOOKING_NOT_PENDING',
    );
    assert.equal(writes, 0);
  } finally {
    await closeDatabase();
  }
});
