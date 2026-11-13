import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapacitySnapshot } from '../types/availability.types.js';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const [{ assessDateAvailability, createBookingAvailabilityService }, { AppError }] = await Promise.all([
  import('./booking-availability.service.js'),
  import('../utils/app-error.js'),
]);

const emptySnapshot: CapacitySnapshot = {
  activeBookingCount: 0,
  largestGuestCount: 0,
  hasMediumEvent: false,
};

for (const [guestCount, capacityLimit, status, remainingRequestSlots] of [
  [149, 6, 'AVAILABLE', 5],
  [150, 6, 'NEEDS_CONFIRMATION', 5],
  [499, 6, 'NEEDS_CONFIRMATION', 5],
  [500, 6, 'AVAILABLE', 5],
  [501, 3, 'AVAILABLE', 2],
  [999, 3, 'AVAILABLE', 2],
  [1000, 1, 'LIMITED', 0],
] as const) {
  test(`${guestCount} guests use the documented capacity band`, () => {
    const result = assessDateAvailability({
      date: '2026-12-10',
      guestCount,
      snapshot: emptySnapshot,
      includeProposed: true,
    });

    assert.equal(result.capacityLimit, capacityLimit);
    assert.equal(result.status, status);
    assert.equal(result.remainingRequestSlots, remainingRequestSlots);
    assert.equal(result.activeBookingCount, 0);
    assert.equal(result.requiresAdminConfirmation, guestCount >= 150 && guestCount <= 499);
  });
}

test('a proposed request taking the final slot is limited but still available', () => {
  const result = assessDateAvailability({
    date: '2026-12-10',
    guestCount: 100,
    snapshot: { activeBookingCount: 5, largestGuestCount: 120, hasMediumEvent: false },
    includeProposed: true,
  });

  assert.equal(result.status, 'LIMITED');
  assert.equal(result.capacityLimit, 6);
  assert.equal(result.remainingRequestSlots, 0);
});

test('a proposed large event recalculates a mixed date before accepting it', () => {
  const result = assessDateAvailability({
    date: '2026-12-10',
    guestCount: 600,
    snapshot: { activeBookingCount: 3, largestGuestCount: 100, hasMediumEvent: false },
    includeProposed: true,
  });

  assert.equal(result.status, 'FULL');
  assert.equal(result.capacityLimit, 3);
  assert.equal(result.remainingRequestSlots, 0);
});

test('a medium event on the date requires review without changing a small selected booking', () => {
  const result = assessDateAvailability({
    date: '2026-12-10',
    guestCount: 100,
    snapshot: { activeBookingCount: 1, largestGuestCount: 250, hasMediumEvent: true },
    includeProposed: true,
  });

  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.equal(result.requiresAdminConfirmation, false);
  assert.equal(result.remainingRequestSlots, 4);
});

test('an existing booking summary does not add the selected booking twice', () => {
  const result = assessDateAvailability({
    date: '2026-12-10',
    guestCount: 250,
    snapshot: { activeBookingCount: 2, largestGuestCount: 250, hasMediumEvent: true },
    includeProposed: false,
  });

  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.equal(result.activeBookingCount, 2);
  assert.equal(result.remainingRequestSlots, 4);
  assert.equal(result.requiresAdminConfirmation, true);
});

test('full capacity takes precedence over medium-event confirmation', () => {
  const result = assessDateAvailability({
    date: '2026-12-10',
    guestCount: 250,
    snapshot: { activeBookingCount: 6, largestGuestCount: 250, hasMediumEvent: true },
    includeProposed: true,
  });

  assert.equal(result.status, 'FULL');
  assert.equal(result.remainingRequestSlots, 0);
  assert.equal(result.requiresAdminConfirmation, true);
});

test('preview reads an unlocked snapshot and evaluates the proposed booking', async () => {
  const calls: unknown[][] = [];
  const service = createBookingAvailabilityService({
    readCapacitySnapshot: async (...args) => {
      calls.push(args);
      return { activeBookingCount: 5, largestGuestCount: 100, hasMediumEvent: false };
    },
  });

  const result = await service.preview('2026-12-10', 100);

  assert.equal(result.status, 'LIMITED');
  assert.deepEqual(calls, [['2026-12-10']]);
});

test('preview maps snapshot failures to a safe availability error', async () => {
  const service = createBookingAvailabilityService({
    readCapacitySnapshot: async () => { throw new Error('database unavailable'); },
  });

  await assert.rejects(service.preview('2026-12-10', 100), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 503);
    assert.equal(error.code, 'AVAILABILITY_UNAVAILABLE');
    return true;
  });
});

test('write assertion requests a locked snapshot and rejects a full date with a coded conflict', async () => {
  const request = { transaction: true };
  const calls: unknown[][] = [];
  const service = createBookingAvailabilityService({
    readCapacitySnapshot: async (...args) => {
      calls.push(args);
      return { activeBookingCount: 6, largestGuestCount: 100, hasMediumEvent: false };
    },
  });

  await assert.rejects(
    service.assertCanAccept('2026-12-10', 100, request as never),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'BOOKING_DATE_FULL');
      return true;
    },
  );
  assert.deepEqual(calls, [['2026-12-10', { request, lock: true }]]);
});

test('existing booking summary reuses its request without adding another proposed booking', async () => {
  const request = { transaction: true };
  const calls: unknown[][] = [];
  const service = createBookingAvailabilityService({
    readCapacitySnapshot: async (...args) => {
      calls.push(args);
      return { activeBookingCount: 2, largestGuestCount: 250, hasMediumEvent: true };
    },
  });

  const result = await service.summarizeExisting('2026-12-10', 250, request as never);

  assert.equal(result.activeBookingCount, 2);
  assert.equal(result.remainingRequestSlots, 4);
  assert.deepEqual(calls, [['2026-12-10', { request }]]);
});

test('pending edit excludes its current reservation from the locked capacity snapshot', async () => {
  const request = { transaction: true };
  const calls: unknown[][] = [];
  const service = createBookingAvailabilityService({
    readCapacitySnapshot: async (...args) => {
      calls.push(args);
      return { activeBookingCount: 2, largestGuestCount: 120, hasMediumEvent: false };
    },
  });

  await service.assertCanAccept('2026-12-10', 120, request as never, 42);

  assert.deepEqual(calls, [[
    '2026-12-10',
    { request, lock: true, excludeReservationId: 42 },
  ]]);
});

test('500 guests can take a fourth small-event slot while 501 guests cannot', () => {
  const snapshot = { activeBookingCount: 3, largestGuestCount: 500, hasMediumEvent: false };
  const assess = (guestCount: number) => assessDateAvailability({ date: '2026-11-17', guestCount, snapshot, includeProposed: true });
  assert.equal(assess(500).status, 'AVAILABLE');
  assert.equal(assess(500).capacityLimit, 6);
  assert.equal(assess(501).status, 'FULL');
});