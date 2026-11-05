import { AppError } from '../utils/app-error.js';
import { isoDate } from '../utils/validation.js';

export const BIG_CASH_EVENT_GUESTS = 500;
export const CASH_OFFICE_HOURS = 'Daily, 8:00 AM-6:00 PM Philippine Time';

export function cashPreparationDays(guestCount: number): number {
  return guestCount >= BIG_CASH_EVENT_GUESTS ? 5 : 3;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function cashDepositDeadline(eventDate: string, guestCount: number): { date: string; at: string; preparationDays: number } {
  const preparationDays = cashPreparationDays(guestCount);
  const date = shiftDate(isoDate(eventDate, 'Event date'), -preparationDays);
  return { date, at: `${date}T10:00:00.000Z`, preparationDays }; // 6 PM in Asia/Manila.
}

export function minimumCashEventDate(guestCount: number, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (name: string) => parts.find(value => value.type === name)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  // The office opens daily; at closing, the next cash payment date is tomorrow.
  return shiftDate(today, (Number(part('hour')) >= 18 ? 1 : 0) + cashPreparationDays(guestCount));
}

export function assertCashPaymentWindow(eventDate: string, guestCount: number, now = new Date(), status = 400): void {
  const minimum = minimumCashEventDate(guestCount, now);
  if (eventDate < minimum) {
    throw new AppError(status, `Cash down payment must be received by 6:00 PM Philippine Time on the ${cashPreparationDays(guestCount)}-day preparation cutoff. Select an event date on or after ${minimum}.`, 'CASH_PAYMENT_WINDOW_UNAVAILABLE');
  }
}
