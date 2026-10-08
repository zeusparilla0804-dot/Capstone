import assert from 'node:assert/strict';
import test from 'node:test';
import { assessDateAvailability } from './booking-availability.service.js';
import type { CapacitySnapshot } from '../types/availability.types.js';

const emptySnapshot: CapacitySnapshot = {
  activeBookingCount: 0,
  largestGuestCount: 0,
  hasMediumEvent: false,
};

for (const [guestCount, capacityLimit, status, remainingRequestSlots] of [
  [149, 6, 'AVAILABLE', 5],
  [150, 6, 'NEEDS_CONFIRMATION', 5],
  [499, 6, 'NEEDS_CONFIRMATION', 5],
  [500, 3, 'AVAILABLE', 2],
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
