import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import { assertOwnedPendingBooking } from '../repositories/booking.repository.js';
import type { CapacitySnapshot, AvailabilityStatus } from '../types/availability.types.js';
import { AppError } from '../utils/app-error.js';
import { assessDateAvailability } from './booking-availability.service.js';

export interface CalendarDateAvailability { date: string; status: AvailabilityStatus; }

export function buildMonthAvailability(month: string, guestCount: number,
  snapshots: ReadonlyMap<string, CapacitySnapshot>): CalendarDateAvailability[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const length = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  return Array.from({ length }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    const snapshot = snapshots.get(date) ?? { activeBookingCount: 0, largestGuestCount: 0, hasMediumEvent: false };
    return { date, status: assessDateAvailability({ date, guestCount, snapshot, includeProposed: true }).status };
  });
}

export async function calendarMonthAvailability(month: string, guestCount: number, customerId: number,
  reservationId?: number): Promise<CalendarDateAvailability[]> {
  if (!/^(?:20\d\d|2100)-(?:0[1-9]|1[0-2])$/.test(month)) throw new AppError(400, 'Calendar month is invalid.');
  if (!Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 1500) throw new AppError(400, 'Guest count is invalid.');
  if (reservationId !== undefined) await assertOwnedPendingBooking(customerId, reservationId);
  const request = (await getDbPool()).request().input('start', sql.Date, new Date(`${month}-01T00:00:00Z`));
  const exclusion = reservationId === undefined ? '' : ' AND reservation_id <> @excludeReservationId';
  if (reservationId !== undefined) request.input('excludeReservationId', sql.Int, reservationId);
  const result = await request.query(`SELECT CONVERT(varchar(10),event_date,23) date,
      COUNT_BIG(*) activeBookingCount,COALESCE(MAX(guest_count),0) largestGuestCount,
      COALESCE(MAX(CASE WHEN guest_count BETWEEN 150 AND 499 THEN 1 ELSE 0 END),0) hasMediumEvent
    FROM dbo.RESERVATION
    WHERE event_date >= @start AND event_date < DATEADD(month,1,@start)
      AND status IN('PENDING','APPROVED','AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','CONFIRMED')
      ${exclusion} GROUP BY event_date`);
  const snapshots = new Map<string, CapacitySnapshot>(result.recordset.map(row => [String(row.date), {
    activeBookingCount: Number(row.activeBookingCount), largestGuestCount: Number(row.largestGuestCount),
    hasMediumEvent: Boolean(row.hasMediumEvent),
  }]));
  return buildMonthAvailability(month, guestCount, snapshots);
}
