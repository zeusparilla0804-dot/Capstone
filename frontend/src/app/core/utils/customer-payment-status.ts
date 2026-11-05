import type { Booking } from '../models';

export function bookingTotal(booking: Booking): number {
  return booking.total ?? Math.max(booking.package.packageTotal
    + booking.addOns.reduce((sum, addOn) => sum + addOn.price, 0) - booking.discount, 0);
}

// Display state only: amountPaid is the backend's cumulative recorded/verified amount,
// not the amount claimed on an uploaded receipt. Never mutate the reservation status.
export function customerPaymentStatus(booking: Booking): string {
  if (['cancelled', 'rejected', 'completed'].includes(booking.status)) return booking.status;
  if (booking.status === 'payment_submitted') return 'pending_payment_verification';
  const total = Math.round(bookingTotal(booking) * 100);
  const paid = Math.round(booking.amountPaid * 100);
  if (Number.isFinite(total) && Number.isFinite(paid) && total > 0 && paid > 0) {
    if (paid >= total) return 'fully_paid';
    if (paid >= Math.round(total * 0.5)) return 'down_payment_verified';
    return 'partially_paid';
  }
  if (hasCashPaymentAction(booking)) return 'awaiting_cash_payment';
  return booking.status === 'payment_verified' ? 'awaiting_payment' : booking.status;
}

export function hasCashPaymentAction(booking: Booking): boolean {
  return booking.paymentMethod === 'cash'
    && ['approved', 'awaiting_payment', 'payment_submitted', 'payment_verified', 'confirmed', 'completed'].includes(booking.status)
    && booking.amountPaid < bookingTotal(booking);
}

export function hasOnlinePaymentAction(booking: Booking): boolean {
  return booking.paymentMethod !== 'cash'
    && ['awaiting_payment', 'payment_submitted', 'payment_verified', 'confirmed', 'completed'].includes(booking.status)
    && Math.round(booking.amountPaid * 100) < Math.round(bookingTotal(booking) * 100);
}
