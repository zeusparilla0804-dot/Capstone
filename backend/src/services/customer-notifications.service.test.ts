import assert from 'node:assert/strict';
import test from 'node:test';
import { customerNotification } from './customer-notifications.service.js';

test('a smaller verified deposit tells the customer the shortfall, total balance and correction note', () => {
  const item = customerNotification({ id: 'email:3', templateKey: 'PAYMENT_PROOF_VERIFIED', bookingId: 42, reference: 'BK-42', createdAt: '2026-11-12', isRead: false,
    verifiedAmount: 70000, amountPaid: 70000, requiredDeposit: 77000, remainingDeposit: 7000, remainingBalance: 84000,
    correctionReason: 'Only 70000 received.' } as any);
  assert.equal(item?.title, 'Down payment incomplete');
  assert.match(item!.message, /7,000\.00/);
  assert.match(item!.message, /84,000\.00/);
  assert.match(item!.message, /Only 70000 received/);
  assert.equal(item?.link, '/my-bookings/42/payment');
});

test('QR-ready notification points to the assigned booking payment instructions', () => {
  const item = customerNotification({ id: 'qr:42:1', templateKey: 'PAYMENT_QR_READY', bookingId: 42, reference: 'BK-42', createdAt: '2026-11-08', isRead: false });
  assert.equal(item?.title, 'Your payment QR is ready');
  assert.equal(item?.link, '/my-bookings/42/payment');
  assert.equal(item?.isRead, false);
});
test('customer updates use controlled copy and never expose unknown notification payloads', () => {
  assert.equal(customerNotification({ id: 'email:1', templateKey: 'PASSWORD_RESET_REQUESTED', bookingId: 42, reference: 'BK-42', createdAt: '2026-11-08', isRead: false }), null);
  assert.equal(customerNotification({ id: 'email:2', templateKey: 'PAYMENT_REQUESTED', bookingId: 42, reference: 'BK-42', createdAt: '2026-11-08', isRead: true })?.link, '/book-event?paymentBooking=42&step=4');
});
