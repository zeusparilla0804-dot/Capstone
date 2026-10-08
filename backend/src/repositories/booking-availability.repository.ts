import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import type { CapacitySnapshot } from '../types/availability.types.js';

interface CapacitySnapshotRow {
  activeBookingCount: number | string;
  largestGuestCount: number | string | null;
  hasMediumEvent: number | boolean | null;
}

export interface CapacitySnapshotOptions {
  request?: sql.Request;
  lock?: boolean;
}

export async function readCapacitySnapshot(
  eventDate: string,
  options?: CapacitySnapshotOptions,
): Promise<CapacitySnapshot> {
  const request = options?.request ?? (await getDbPool()).request();
  const lockHint = options?.lock && options.request ? ' WITH(UPDLOCK,HOLDLOCK)' : '';
  const result = await request
    .input('eventDate', sql.Date, new Date(`${eventDate}T00:00:00.000Z`))
    .query<CapacitySnapshotRow>(`
      SELECT
        COUNT_BIG(*) AS activeBookingCount,
        COALESCE(MAX(guest_count), 0) AS largestGuestCount,
        COALESCE(MAX(CASE WHEN guest_count BETWEEN 150 AND 499 THEN 1 ELSE 0 END), 0) AS hasMediumEvent
      FROM dbo.RESERVATION${lockHint}
      WHERE event_date = @eventDate
        AND status IN(
          'PENDING',
          'APPROVED',
          'AWAITING_PAYMENT',
          'PAYMENT_SUBMITTED',
          'PAYMENT_VERIFIED',
          'CONFIRMED'
        );
    `);
  const row = result.recordset[0];

  return {
    activeBookingCount: Number(row?.activeBookingCount ?? 0),
    largestGuestCount: Number(row?.largestGuestCount ?? 0),
    hasMediumEvent: Boolean(row?.hasMediumEvent),
  };
}
