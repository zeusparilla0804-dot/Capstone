import { AppError } from '../utils/app-error.js';
import { assertSupportedPaymentMethod } from './payment-method-policy.js';

export function assertPaymentDeferred(method?: string): void {
  if (method) throw new AppError(400, 'Choose a payment method after LA Chef requests payment.');
}

export function assertPaymentSelection(
  booking: { status: string; method?: string | null; amountPaid: number; hasProof?: boolean },
  method: string,
): 'CASH' | 'BANK_TRANSFER' | 'E-WALLET' {
  const normalized = method === 'cash' ? 'CASH'
    : method === 'bank-transfer' ? 'BANK_TRANSFER'
    : method === 'e-wallet' ? 'E-WALLET' : null;
  if (!normalized) throw new AppError(400, 'Payment method is invalid.');
  assertSupportedPaymentMethod(normalized);
  if (booking.status !== 'AWAITING_PAYMENT') throw new AppError(409, 'Choose a payment method only after LA Chef requests payment.');
  if (booking.amountPaid > 0 || booking.hasProof) throw new AppError(409, 'Payment method can no longer be changed after a proof or payment.');
  return normalized;
}

export function assertProofMatchesPayment(selected: string | null | undefined, proofMethod: string): void {
  if (!selected) throw new AppError(409, 'Choose a payment method after approval before submitting proof.');
  const normalized = proofMethod === 'E_WALLET' ? 'E-WALLET' : proofMethod;
  if (selected.toUpperCase() !== normalized) throw new AppError(409, 'Proof must use the chosen payment method.');
}
