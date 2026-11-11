import assert from 'node:assert/strict';
import test from 'node:test';
import { customerNotification } from './customer-notifications.service.js';

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
