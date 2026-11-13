export interface CashDepositDeadline { readonly date: string; readonly at: string; readonly preparationDays: number; }

export function cashPreparationDays(guestCount: number): number { return guestCount > 500 ? 5 : 3; }

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function cashDepositDeadline(eventDate: string, guestCount: number): CashDepositDeadline | null {
  const day = eventDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== day) return null;
  const preparationDays = cashPreparationDays(guestCount);
  const date = shiftDate(day, -preparationDays);
  return { date, at: `${date}T10:00:00.000Z`, preparationDays };
}

export function minimumBookingEventDate(guestCount: number, now = new Date()): string {
  return shiftDate(minimumCashEventDate(guestCount, now), 1);
}

export function minimumCashEventDate(guestCount: number, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (name: string) => parts.find(value => value.type === name)!.value;
  return shiftDate(`${part('year')}-${part('month')}-${part('day')}`,
    (Number(part('hour')) >= 23 ? 1 : 0) + cashPreparationDays(guestCount));
}
