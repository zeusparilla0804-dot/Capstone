import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCustomerBookingDate, bookingSubmissionHash } from './booking-submission-policy.js';
import { assertCashPaymentWindow, cashDepositDeadline } from './cash-payment-policy.js';

test('booking retries retain menu identity independently of object key order', () => {
  const draft = { eventType: 'wedding', eventDate: '2027-01-10', eventTime: '14:00', venue: 'Venue',
    guestCount: 50, packageId: 246, addOnIds: [] };
  const original = bookingSubmissionHash({ ...draft, menuSelections: { pork: 'Pork dish', sideKind: 'Pasta' } });
  assert.equal(bookingSubmissionHash({ ...draft, menuSelections: { sideKind: 'Pasta', pork: 'Pork dish' } }), original);
  assert.notEqual(bookingSubmissionHash({ ...draft, menuSelections: { pork: 'Changed dish', sideKind: 'Pasta' } }), original);
  assert.notEqual(bookingSubmissionHash(draft), original);
});

test('new bookings reserve one deposit day plus three or five preparation days for every method', () => {
  const now = new Date('2026-11-10T12:00:00Z'); // 8 PM Manila: office is closed.
  for (const [guests, earliest, tooSoon] of [[499, '2026-11-14', '2026-11-13'], [501, '2026-11-16', '2026-11-15']] as const) {
    assert.throws(() => assertCustomerBookingDate(tooSoon, guests, now), /days in advance/);
    assert.doesNotThrow(() => assertCustomerBookingDate(earliest, guests, now));
    assert.doesNotThrow(() => assertCashPaymentWindow(earliest, guests, now));
    assert.equal(cashDepositDeadline(earliest, guests).date, '2026-11-11');
  }
});

test('booking calendar allowance rolls over at 11 PM Manila and crosses years correctly', () => {
  assert.doesNotThrow(() => assertCustomerBookingDate('2027-01-03', 100, new Date('2026-12-30T14:59:59Z')));
  assert.throws(() => assertCustomerBookingDate('2027-01-03', 100, new Date('2026-12-30T15:00:00Z')));
  assert.doesNotThrow(() => assertCustomerBookingDate('2027-01-04', 100, new Date('2026-12-30T15:00:00Z')));
});
