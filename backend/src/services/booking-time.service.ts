import sql from 'mssql';
import { runBookingStatusTransaction } from '../repositories/booking-status.repository.js';
import { writeAdminAudit } from '../repositories/audit.repository.js';
import { AppError } from '../utils/app-error.js';

const validTime = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
function timeLabel(value: string | null): string {
  if (!value) return 'not specified';
  const hour = Number(value.slice(0, 2));
  return `${hour % 12 || 12}:${value.slice(3)} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function createBookingTimeService(transaction = runBookingStatusTransaction) {
  return {
    async update(adminId: number, reservationId: number, raw: unknown) {
      const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      if (!validTime(value['eventTime'])) throw new AppError(400, 'Enter a valid event time in HH:mm format.');
      if (value['expectedTime'] !== null && !validTime(value['expectedTime'])) throw new AppError(400, 'The original event time is required. Refresh this reservation.');
      if (![adminId, reservationId].every(id => Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647)) throw new AppError(400, 'Invalid identifier.');
      const eventTime = value['eventTime'];
      return transaction(async request => {
        const result = await request.replaceInput('reservationId', sql.Int, reservationId).query(`
          SELECT status,CONVERT(varchar(5),event_time,108) eventTime
          FROM dbo.RESERVATION WITH(UPDLOCK,HOLDLOCK) WHERE reservation_id=@reservationId`);
        const booking = result.recordset[0];
        if (!booking) throw new AppError(404, 'Reservation not found.');
        if (!['PENDING', 'APPROVED', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED'].includes(booking.status)) throw new AppError(409, 'Only an active reservation can have its event time adjusted.');
        const oldTime: string | null = booking.eventTime ?? null;
        if (oldTime !== value['expectedTime']) throw new AppError(409, 'The event time changed. Refresh this reservation before adjusting it.');
        if (oldTime === eventTime) return { eventTime };
        await request.replaceInput('eventTime', sql.VarChar(5), eventTime)
          .query('UPDATE dbo.RESERVATION SET event_time=CONVERT(time,@eventTime) WHERE reservation_id=@reservationId');
        await request.replaceInput('status', sql.VarChar(30), booking.status)
          .replaceInput('adminId', sql.Int, adminId)
          .replaceInput('reason', sql.NVarChar(1000), `Event time adjusted from ${timeLabel(oldTime)} to ${timeLabel(eventTime)} by administrator after agreement with the client.`)
          .query(`INSERT dbo.BOOKING_STATUS_HISTORY(reservation_id,previous_status,next_status,actor_type,actor_id,reason)
            VALUES(@reservationId,@status,@status,'ADMIN',@adminId,@reason)`);
        await writeAdminAudit({ adminId, action: 'BOOKING_TIME_UPDATED', entityType: 'BOOKING', entityId: reservationId,
          oldValues: { eventTime: oldTime }, newValues: { eventTime } }, request);
        return { eventTime };
      });
    },
  };
}
export const bookingTimeService = createBookingTimeService();
