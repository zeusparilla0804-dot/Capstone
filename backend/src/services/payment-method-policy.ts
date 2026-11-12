import { AppError } from '../utils/app-error.js';

// Older ledger rows keep their original method. Only these methods accept new payments.
export function assertSupportedPaymentMethod(method: unknown): asserts method is 'CASH' | 'BANK_TRANSFER' {
  if (method !== 'CASH' && method !== 'BANK_TRANSFER') throw new AppError(400, 'LA Chef accepts cash and bank transfer only.');
}

export function assertSupportedOnlineMethod(method: unknown): asserts method is 'BANK_TRANSFER' {
  assertSupportedPaymentMethod(method);
  if (method !== 'BANK_TRANSFER') throw new AppError(400, 'Online payment must use bank transfer.');
}
