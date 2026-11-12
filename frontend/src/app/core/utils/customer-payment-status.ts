import type { Booking } from '../models';
import { paymentDisplayStatus } from './payment-display-status';

export function bookingTotal(booking: Booking): number {
  return booking.total ?? Math.max(booking.package.packageTotal
    + booking.addOns.reduce((sum, addOn) => sum + addOn.price, 0) - booking.discount, 0);
}

export function depositProgress(total: number, amountPaid: number) {
  const totalCents = Math.max(0, Math.round(total * 100));
  const paidCents = Math.max(0, Math.round(amountPaid * 100));
  const requiredCents = Math.round(totalCents * 0.5);
  return { requiredDeposit: requiredCents / 100, remainingDeposit: Math.max(0, requiredCents - paidCents) / 100,
    outstandingBalance: Math.max(0, totalCents - paidCents) / 100 };
}

export function hasIncompleteDownPayment(booking: Booking): boolean {
  return !['cancelled', 'rejected', 'expired', 'completed'].includes(booking.status)
    && booking.amountPaid > 0 && depositProgress(bookingTotal(booking), booking.amountPaid).remainingDeposit > 0;
}

// Display state only: amountPaid is the backend's cumulative recorded/verified amount,
// not the amount claimed on an uploaded receipt. Never mutate the reservation status.
export function customerPaymentStatus(booking: Booking): string {
  if (['cancelled', 'rejected', 'expired'].includes(booking.status)) return booking.status;
  const paymentStatus = paymentDisplayStatus({ total: bookingTotal(booking), amountPaid: booking.amountPaid,
    status: booking.status, latestProofStatus: booking.latestProofStatus });
  if (paymentStatus) return paymentStatus === 'partially_paid' && hasIncompleteDownPayment(booking) ? 'down_payment_incomplete' : paymentStatus;
  if (booking.status === 'completed') return booking.status;
  if (hasCashPaymentAction(booking)) return 'awaiting_cash_payment';
  return booking.status === 'payment_verified' ? 'awaiting_payment' : booking.status;
}

export function hasCashPaymentAction(booking: Booking): boolean {
  return booking.paymentMethod === 'cash'
    && ['approved', 'awaiting_payment', 'payment_submitted', 'payment_verified', 'confirmed', 'completed'].includes(booking.status)
    && booking.amountPaid < bookingTotal(booking);
}

export function hasOnlinePaymentAction(booking: Booking): boolean {
  return booking.paymentMethod === 'bank-transfer'
    && ['awaiting_payment', 'payment_submitted', 'payment_verified', 'confirmed', 'completed'].includes(booking.status)
    && Math.round(booking.amountPaid * 100) < Math.round(bookingTotal(booking) * 100);
}

export function isWaitingForPaymentQr(booking: Booking): boolean {
  return hasOnlinePaymentAction(booking) && booking.status !== 'payment_submitted' && !booking.paymentQrReady;
}

export function needsPaymentMethodChoice(booking: Booking): boolean {
  return booking.status === 'awaiting_payment' && (!booking.paymentMethod
    || (booking.paymentMethod === 'gcash' && booking.amountPaid === 0 && !booking.latestProofStatus));
}
