import type { PaymentInput } from '../types/admin.types.js';
import { recordPayment } from '../repositories/admin.repository.js';
import { findInvoiceIdByBooking } from '../repositories/invoice.repository.js';
import { AppError } from '../utils/app-error.js';
import { assertSupportedPaymentMethod } from './payment-method-policy.js';
import { finiteMoney, identifier, isoDate, text } from '../utils/validation.js';

export function completionPaymentInput(reservationId: number, body: unknown): PaymentInput {
  identifier(reservationId, 'Booking identifier');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'Completion details are required.');
  const value = body as Record<string, unknown>;
  if (value['eventFinished'] !== true) throw new AppError(400, 'Confirm that the event has finished before completing it.');
  if (typeof value['amount'] !== 'number') throw new AppError(400, 'Final payment amount is invalid.');
  const amount = finiteMoney(value['amount'], 'Final payment amount', true);
  if (amount > 0 && value['fundsReceived'] !== true) throw new AppError(400, 'Confirm that the final payment was actually received and verified.');
  if (!['CASH', 'BANK_TRANSFER', 'E-WALLET'].includes(String(value['method']))) throw new AppError(400, 'Final payment method is invalid.');
  assertSupportedPaymentMethod(value['method']);
  const requestId = value['requestId'];
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new AppError(400, 'A valid completion request ID is required. Refresh and try again.');
  }
  const method = value['method'] as PaymentInput['method'];
  const reference = amount === 0 ? undefined : method === 'CASH' ? `CASH-${requestId.replace(/-/g, '').toUpperCase()}`
    : text(value['reference'], 'Transaction reference', { max: 150 });
  return { reservationId, amount, method, reference, requestId, paymentDate: isoDate(value['paymentDate'], 'Payment date') };
}

export async function completeEventPayment(adminId: number, reservationId: number, body: unknown) {
  const input = completionPaymentInput(reservationId, body);
  try {
    if (!await recordPayment(adminId, input, { completeEvent: true })) throw new AppError(404, 'Booking payment record not found.');
  } catch (error) {
    const messages: Record<string, string> = {
      FINAL_BALANCE_CHANGED: 'The remaining balance changed. Refresh this reservation and confirm the current amount.',
      EVENT_NOT_FINISHED: 'This event can only be completed on its event date or later.',
      FINAL_PAYMENT_DATE: 'The final payment date must be between the event date and today.',
      PAYMENT_BOOKING_STATUS: 'Record and verify the deposit before completing this event.',
      PAYMENT_REFERENCE_CONFLICT: 'This payment reference is already recorded with different details.',
      OVERPAYMENT: 'The final payment exceeds the remaining balance.',
    };
    const message = error instanceof Error ? messages[error.message] : undefined;
    if (message && error instanceof Error) throw new AppError(409, message, error.message);
    if (typeof error === 'object' && error !== null && 'number' in error && [2601, 2627].includes(Number(error.number))) {
      throw new AppError(409, 'This payment reference has already been recorded. Refresh the reservation before trying again.');
    }
    throw error;
  }
  return { status: 'COMPLETED' as const, amountRecorded: input.amount, reference: input.reference, invoiceId: await findInvoiceIdByBooking(reservationId) };
}
