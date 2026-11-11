import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCashPaymentWindow, cashDepositDeadline, minimumCashEventDate } from './cash-payment-policy.js';
import { renderEmail } from '../templates/email-templates.js';

test('cash deposit cutoffs use three or five calendar days and close at 6 PM Manila', () => {
  assert.deepEqual(cashDepositDeadline('2026-11-20', 499), { date: '2026-11-17', at: '2026-11-17T10:00:00.000Z', preparationDays: 3 });
  assert.deepEqual(cashDepositDeadline('2026-11-20', 500), { date: '2026-11-15', at: '2026-11-15T10:00:00.000Z', preparationDays: 5 });
  assert.equal(cashDepositDeadline('2027-01-03', 500).date, '2026-12-29');
  assert.equal(cashDepositDeadline('2028-03-03', 100).date, '2028-02-29');
});

test('cash office payment windows include weekends and shift after closing in Philippine time', () => {
  for (const [guestCount, now, expected] of [
    [499, '2026-10-31T00:00:00Z', '2026-11-03'],
    [500, '2026-10-31T00:00:00Z', '2026-11-05'],
    [499, '2026-10-31T09:59:59.999Z', '2026-11-03'],
    [500, '2026-10-31T09:59:59.999Z', '2026-11-05'],
    [499, '2026-10-31T10:00:00Z', '2026-11-04'],
    [500, '2026-10-31T10:00:00Z', '2026-11-06'],
    [499, '2026-10-31T16:00:00Z', '2026-11-04'],
    [500, '2026-12-30T01:00:00Z', '2027-01-04'],
  ] as const) {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));
    const calendarExpected = hour >= 18 && hour < 23 ? `${expected.slice(0,8)}${String(Number(expected.slice(8))-1).padStart(2,'0')}` : expected;
    assert.equal(minimumCashEventDate(guestCount, new Date(now)), calendarExpected);
    assert.doesNotThrow(() => assertCashPaymentWindow(expected, guestCount, new Date(now)));
  }
});

test('calendar date rollover is 11 PM but receiving cash still closes at 6 PM', () => {
  assert.equal(minimumCashEventDate(100, new Date('2026-11-10T14:59:59Z')), '2026-11-13');
  assert.equal(minimumCashEventDate(100, new Date('2026-11-10T15:00:00Z')), '2026-11-14');
  assert.equal(minimumCashEventDate(500, new Date('2026-11-10T15:00:00Z')), '2026-11-16');
  assert.throws(() => assertCashPaymentWindow('2026-11-13', 100, new Date('2026-11-10T12:00:00Z')), /6:00 PM/);
});

test('cash submission rejects dates inside the preparation cutoff without an extra office-day allowance', () => {
  const now = new Date('2026-10-31T00:00:00Z');
  assert.doesNotThrow(() => assertCashPaymentWindow('2026-11-03', 499, now));
  assert.doesNotThrow(() => assertCashPaymentWindow('2026-11-05', 500, now));
  for (const [eventDate, guestCount, preparationDays] of [['2026-11-02', 499, 3], ['2026-11-04', 500, 5]] as const) {
    assert.throws(() => assertCashPaymentWindow(eventDate, guestCount, now), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, new RegExp(`${preparationDays}-day preparation cutoff`));
      assert.doesNotMatch(error.message, /2 office|two office/i);
      return true;
    });
  }
});

test('approval emails preserve legacy payloads and render escaped cash instructions when provided', () => {
  const payload = { customerName: 'Customer', bookingReference: 'BK-5', eventDate: '2026-11-20' };
  assert.doesNotThrow(() => renderEmail('BOOKING_APPROVED', payload));
  const rendered = renderEmail('BOOKING_APPROVED', { ...payload, cashPaymentInstructions: 'Pay by November 15, 6:00 PM. Office: 8:00 AM-6:00 PM. <safe>' });
  assert.match(rendered.text, /November 15, 6:00 PM/);
  assert.match(rendered.html, /&lt;safe&gt;/);
});
