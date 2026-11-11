import { cashDepositDeadline, minimumCashEventDate, minimumBookingEventDate } from './cash-payment-policy';

describe('cash payment policy', () => {
  it('matches the small/big cutoffs, Philippine closing time, and calendar boundaries', () => {
    expect(cashDepositDeadline('2026-11-20', 499)).toEqual({ date: '2026-11-17', at: '2026-11-17T10:00:00.000Z', preparationDays: 3 });
    expect(cashDepositDeadline('2026-11-20', 500)).toEqual({ date: '2026-11-15', at: '2026-11-15T10:00:00.000Z', preparationDays: 5 });
    expect(cashDepositDeadline('2027-01-03', 500)?.date).toBe('2026-12-29');
    expect(cashDepositDeadline('2028-03-03', 100)?.date).toBe('2028-02-29');
    expect(cashDepositDeadline('2026-02-31', 100)).toBeNull();
  });
  it('uses only preparation days before closing, including weekends and calendar boundaries', () => {
    expect(minimumCashEventDate(100, new Date('2026-10-31T00:00:00Z'))).toBe('2026-11-03');
    expect(minimumCashEventDate(499, new Date('2026-10-31T09:59:59Z'))).toBe('2026-11-03');
    expect(minimumCashEventDate(500, new Date('2026-10-31T00:00:00Z'))).toBe('2026-11-05');
    expect(minimumCashEventDate(500, new Date('2026-12-30T01:00:00Z'))).toBe('2027-01-04');
  });
  it('adjusts the calendar at 11 PM Manila while preserving the 6 PM cash deadline', () => {
    expect(minimumCashEventDate(100, new Date('2026-10-31T10:00:00Z'))).toBe('2026-11-03');
    expect(minimumCashEventDate(500, new Date('2026-10-31T14:59:59Z'))).toBe('2026-11-05');
    expect(minimumCashEventDate(100, new Date('2026-10-31T15:00:00Z'))).toBe('2026-11-04');
    expect(minimumCashEventDate(500, new Date('2026-10-31T15:00:00Z'))).toBe('2026-11-06');
    expect(minimumCashEventDate(100, new Date('2026-10-31T16:00:00Z'))).toBe('2026-11-04');
  });
});

describe('booking deposit allowance', () => {
  it('adds one deposit day for both guest tiers and preserves the 11 PM rollover', () => {
    expect(minimumBookingEventDate(499, new Date('2026-11-10T12:00:00Z'))).toBe('2026-11-14');
    expect(minimumBookingEventDate(500, new Date('2026-11-10T12:00:00Z'))).toBe('2026-11-16');
    expect(minimumBookingEventDate(499, new Date('2026-11-10T15:00:00Z'))).toBe('2026-11-15');
  });
});
