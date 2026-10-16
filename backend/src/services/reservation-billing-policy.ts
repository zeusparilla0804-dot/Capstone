import { AppError } from '../utils/app-error.js';

export const RESERVATION_DEPOSIT_RATE = 0.5 as const;

function toCurrencyCents(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new AppError(
      500,
      'Reservation billing values are invalid.',
      'RESERVATION_BILLING_INVALID',
    );
  }

  return Math.round(value * 100);
}

export function requiredReservationDeposit(total: number): number {
  const totalCents = toCurrencyCents(total);
  return Math.round(totalCents * RESERVATION_DEPOSIT_RATE) / 100;
}

export function hasRequiredReservationDeposit(total: number, amountPaid: number): boolean {
  const requiredCents = toCurrencyCents(requiredReservationDeposit(total));
  return toCurrencyCents(amountPaid) >= requiredCents;
}
