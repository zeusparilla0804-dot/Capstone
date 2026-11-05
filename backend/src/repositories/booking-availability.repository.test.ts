import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const { readCapacitySnapshot } = await import('./booking-availability.repository.js');

interface CapturedInput {
  name: string;
  type: unknown;
  value: unknown;
}

class FakeRequest {
  readonly inputs: CapturedInput[] = [];
  command = '';

  input(name: string, type: unknown, value: unknown): this {
    this.inputs.push({ name, type, value });
    return this;
  }

  replaceInput(name: string, type: unknown, value: unknown): this {
    const previous = this.inputs.findIndex(input => input.name === name);
    if (previous >= 0) this.inputs.splice(previous, 1);
    return this.input(name, type, value);
  }

  async query(command: string) {
    this.command = command;
    return {
      recordset: [{ activeBookingCount: 4, largestGuestCount: 620, hasMediumEvent: 1 }],
      rowsAffected: [1],
    };
  }
}

test('capacity snapshot binds the date and aggregates only active booking statuses', async () => {
  const request = new FakeRequest();

  const result = await readCapacitySnapshot('2026-12-10', {
    request: request as unknown as sql.Request,
  });

  assert.deepEqual(result, {
    activeBookingCount: 4,
    largestGuestCount: 620,
    hasMediumEvent: true,
  });
  assert.equal(request.inputs.length, 1);
  assert.equal(request.inputs[0]?.name, 'eventDate');
  assert.equal((request.inputs[0]?.value as Date).toISOString(), '2026-12-10T00:00:00.000Z');
  assert.match(request.command, /COUNT_BIG\s*\(\s*\*\s*\)/i);
  assert.match(request.command, /MAX\s*\(\s*guest_count\s*\)/i);
  assert.match(request.command, /guest_count\s+BETWEEN\s+150\s+AND\s+499/i);
  assert.match(request.command, /event_date\s*=\s*@eventDate/i);
  for (const status of ['PENDING', 'APPROVED', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED']) {
    assert.match(request.command, new RegExp(`'${status}'`, 'i'));
  }
  for (const status of ['REJECTED', 'CANCELLED', 'COMPLETED']) {
    assert.doesNotMatch(request.command, new RegExp(`'${status}'`, 'i'));
  }
  assert.doesNotMatch(request.command, /BOOKING_POLICY|UPDLOCK|HOLDLOCK/i);
});

test('capacity snapshot can repeat a locked availability check on the same transaction request', async () => {
  const request = new FakeRequest();
  await readCapacitySnapshot('2026-12-10', { request: request as unknown as sql.Request, lock: true, excludeReservationId: 42 });
  await readCapacitySnapshot('2026-12-10', { request: request as unknown as sql.Request, lock: true, excludeReservationId: 42 });
  assert.equal(request.inputs.length, 2);
  assert.equal(request.inputs.find(input => input.name === 'excludeReservationId')?.value, 42);
});

test('capacity snapshot adds serializable lock hints only to a supplied write request', async () => {
  const request = new FakeRequest();

  await readCapacitySnapshot('2026-12-10', {
    request: request as unknown as sql.Request,
    lock: true,
  });

  assert.match(request.command, /dbo\.RESERVATION\s+WITH\s*\(\s*UPDLOCK\s*,\s*HOLDLOCK\s*\)/i);
});

test('capacity snapshot excludes the booking currently being edited', async () => {
  const request = new FakeRequest();

  await readCapacitySnapshot('2026-12-10', {
    request: request as unknown as sql.Request,
    lock: true,
    excludeReservationId: 42,
  });

  const excluded = request.inputs.find((input) => input.name === 'excludeReservationId');
  assert.equal(excluded?.value, 42);
  assert.match(request.command, /reservation_id\s*<>\s*@excludeReservationId/i);
});
