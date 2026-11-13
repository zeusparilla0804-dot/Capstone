export interface CustomerUpdateRow {
  id: string; templateKey: string; bookingId: number; reference: string; createdAt: string; isRead: boolean;
  verifiedAmount?: number; amountPaid?: number; requiredDeposit?: number; remainingDeposit?: number; remainingBalance?: number; correctionReason?: string;
}
const copy: Record<string, readonly [string, string]> = {
  BOOKING_RECEIVED: ['Booking received', 'Your booking has been submitted for review.'],
  BOOKING_APPROVED: ['Booking approved', 'LA Chef has approved your booking.'],
  PAYMENT_REQUESTED: ['Choose your payment method', 'Your booking is ready for the payment step.'],
  PAYMENT_QR_READY: ['Your payment QR is ready', 'Choose an available bank and view its QR and payment instructions.'],
  BOOKING_REJECTED: ['Booking update', 'Your booking was not approved. View your reservations for details.'],
  INVOICE_ISSUED: ['Invoice available', 'Your booking invoice is ready to view.'],
  PAYMENT_PROOF_SUBMITTED: ['Payment proof submitted', 'Your payment proof is awaiting review.'],
  PAYMENT_PROOF_VERIFIED: ['Payment verified', 'Your payment has been verified and recorded.'],
  PAYMENT_PROOF_REJECTED: ['Payment proof needs attention', 'Your payment proof was not accepted. Review the feedback and submit it again.'],
  PAYMENT_RECORDED: ['Payment recorded', 'A payment has been recorded for your booking.'],
  BOOKING_CONFIRMED: ['Booking confirmed', 'Your event reservation is confirmed.'],
  BOOKING_CANCELLED: ['Booking cancelled', 'Your reservation has been cancelled.'],
  BOOKING_RESCHEDULED: ['Event schedule updated', 'Your event schedule has changed. View the updated details.'],
  BOOKING_COMPLETED: ['Event completed', 'Your event has been marked as completed.'],
  UPCOMING_EVENT_REMINDER: ['Your event is coming up', 'Review your event details and any outstanding balance.'],
};
export const customerUpdateTemplates = Object.keys(copy).filter(key => key !== 'PAYMENT_QR_READY');
export function customerNotification(row: CustomerUpdateRow) {
  const content = copy[row.templateKey];
  if (!content) return null;
  let [title, message] = content;
  if (row.templateKey === 'PAYMENT_PROOF_VERIFIED' && typeof row.remainingDeposit === 'number' && Number.isFinite(row.remainingDeposit)
    && typeof row.remainingBalance === 'number' && Number.isFinite(row.remainingBalance) && typeof row.verifiedAmount === 'number' && Number.isFinite(row.verifiedAmount)) {
    const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
    title = row.remainingDeposit > 0 ? 'Down payment incomplete' : 'Payment verified';
    message = `${money(row.verifiedAmount)} verified. ${row.remainingDeposit > 0
      ? `After this review, ${money(row.remainingDeposit)} remained toward the required down payment, included in the ${money(row.remainingBalance)} total balance due.`
      : `Total balance due after this review: ${money(row.remainingBalance)}.`}`;
  }
  if (row.templateKey === 'PAYMENT_PROOF_VERIFIED' && row.correctionReason) message += ` Admin note: ${row.correctionReason}`;
  const link = row.templateKey === 'PAYMENT_REQUESTED' ? `/book-event?paymentBooking=${row.bookingId}&step=4`
    : row.templateKey === 'PAYMENT_QR_READY' || row.templateKey === 'PAYMENT_PROOF_REJECTED' || row.templateKey === 'PAYMENT_PROOF_VERIFIED'
      ? `/my-bookings/${row.bookingId}/payment` : '/my-bookings';
  return { id: row.id, title, message, reference: row.reference,
    createdAt: row.createdAt, isRead: row.isRead, link };
}
