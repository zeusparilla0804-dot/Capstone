import assert from 'node:assert/strict';
import test from 'node:test';
process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
const { buildMonthAvailability } = await import('./booking-calendar.service.js');

test('month availability marks full dates before customers can choose them', () => {
  const days = buildMonthAvailability('2026-11', 100, new Map([
    ['2026-11-10', { activeBookingCount: 6, largestGuestCount: 100, hasMediumEvent: false }],
  ]));
  assert.equal(days.length, 30);
  assert.equal(days.find(day => day.date === '2026-11-10')?.status, 'FULL');
  assert.equal(days.find(day => day.date === '2026-11-11')?.status, 'AVAILABLE');
});

test('November 17 stays selectable for 500 guests when small-event slots remain', () => {
  const snapshots = new Map([['2026-11-17', { activeBookingCount: 3, largestGuestCount: 500, hasMediumEvent: false }]]);
  assert.equal(buildMonthAvailability('2026-11', 500, snapshots).find(day => day.date === '2026-11-17')?.status, 'AVAILABLE');
  assert.equal(buildMonthAvailability('2026-11', 501, snapshots).find(day => day.date === '2026-11-17')?.status, 'FULL');
});