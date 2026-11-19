import sql from 'mssql';
import { insertBookingStatusHistory, runBookingStatusTransaction } from '../repositories/booking-status.repository.js';
import { writeAdminAudit } from '../repositories/audit.repository.js';
import { lockedPayment } from '../repositories/payment-proof.repository.js';
import type { BookingStatus } from '../types/admin.types.js';
import { AppError } from '../utils/app-error.js';
import { isoDate, time24 } from '../utils/validation.js';
import { bookingAvailabilityService } from './booking-availability.service.js';
import { assertCashPaymentWindow } from './cash-payment-policy.js';
import { queueBookingNotification } from './notification.service.js';
import { hasRequiredReservationDeposit } from './reservation-billing-policy.js';

const validTime = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const activeStatuses: readonly BookingStatus[] = ['PENDING', 'APPROVED', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED'];
function timeLabel(value: string | null): string {
  if (!value) return 'not specified';
  const hour = Number(value.slice(0, 2));
  return `${hour % 12 || 12}:${value.slice(3)} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function createBookingTimeService(transaction = runBookingStatusTransaction) {
  return {
    async update(adminId: number, reservationId: number, raw: unknown) {
      const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      if (!validTime(value['eventTime'])) throw new AppError(400, 'Choose a valid event time.');
      if (value['expectedTime'] !== null && !validTime(value['expectedTime'])) throw new AppError(400, 'The original event time is required. Refresh this reservation.');
      if (![adminId, reservationId].every(id => Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647)) throw new AppError(400, 'Invalid identifier.');
      const eventTime = value['eventTime'];
      return transaction(async request => {
        const result = await request.replaceInput('reservationId', sql.Int, reservationId).query(`
          SELECT status,CONVERT(varchar(5),event_time,108) eventTime
          FROM dbo.RESERVATION WITH(UPDLOCK,HOLDLOCK) WHERE reservation_id=@reservationId`);
        const booking = result.recordset[0];
        if (!booking) throw new AppError(404, 'Reservation not found.');
        if (!activeStatuses.includes(booking.status)) throw new AppError(409, 'Only an active reservation can have its event time adjusted.');
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

    async reschedule(adminId: number, reservationId: number, raw: unknown) {
      const body = raw as Record<string, unknown> | null;
      const eventDate = isoDate(body?.['eventDate'], 'Event date');
      const eventTime = time24(body?.['eventTime']);
      const expectedDate = isoDate(body?.['expectedDate'], 'Original event date');
      const expectedTime = body?.['expectedTime'];
      if (expectedTime !== null && !validTime(expectedTime)) {
        throw new AppError(400, 'The original event time is required. Refresh this reservation.');
      }
      if (![adminId, reservationId].every(id => Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647)) {
        throw new AppError(400, 'Invalid identifier.');
      }

      try {
        return await transaction(async request => {
          const result = await request.replaceInput('reservationId', sql.Int, reservationId)
            .query<{ status: BookingStatus; eventDate: string; eventTime: string | null; guestCount: number }>(`
              SELECT status,CONVERT(varchar(10),event_date,23) eventDate,
                CONVERT(varchar(5),event_time,108) eventTime,guest_count guestCount
              FROM dbo.RESERVATION WITH(UPDLOCK,HOLDLOCK) WHERE reservation_id=@reservationId`);
          const booking = result.recordset[0];
          if (!booking) throw new AppError(404, 'Reservation not found.');
          if (!activeStatuses.includes(booking.status)) throw new AppError(409, 'Only active reservations can be rescheduled.');
          if (booking.eventDate === eventDate && booking.eventTime === eventTime) return { eventDate, eventTime };
          if (booking.eventDate !== expectedDate || booking.eventTime !== expectedTime) {
            throw new AppError(409, 'The event schedule changed. Refresh the reservation before rescheduling.', 'BOOKING_SCHEDULE_STALE');
          }

          const dateChanged = booking.eventDate !== eventDate;
          const startAt = Date.parse(`${eventDate}T${eventTime}:00+08:00`);
          if (startAt <= Date.now()) throw new AppError(400, 'Choose an event date and time in the future.', 'EVENT_DATE_PASSED');
          if (dateChanged) await bookingAvailabilityService.assertCanAccept(eventDate, booking.guestCount, request, reservationId);
          const payment = dateChanged ? await lockedPayment(reservationId, request) : undefined;
          const now = new Date();
          if (startAt <= now.getTime()) throw new AppError(400, 'Choose an event date and time in the future.', 'EVENT_DATE_PASSED');
          if (payment?.paymentMethod === 'CASH' && !hasRequiredReservationDeposit(payment.amountDue, payment.amountPaid)) {
            assertCashPaymentWindow(eventDate, booking.guestCount, now, 409);
          }

          await request.replaceInput('newEventDate', sql.VarChar(10), eventDate)
            .replaceInput('eventTime', sql.VarChar(5), eventTime)
            .query('UPDATE dbo.RESERVATION SET event_date=CONVERT(date,@newEventDate,23),event_time=CONVERT(time,@eventTime) WHERE reservation_id=@reservationId');
          if (dateChanged) {
            await request.query(`UPDATE dbo.INVOICE SET due_at=CONVERT(date,@newEventDate,23)
              WHERE reservation_id=@reservationId AND status IN('ISSUED','PARTIALLY_PAID')`);
          }

          await insertBookingStatusHistory({
            reservationId, previousStatus: booking.status, nextStatus: booking.status, actor: { type: 'ADMIN', id: adminId },
            reason: `Event rescheduled from ${booking.eventDate}, ${timeLabel(booking.eventTime)} to ${eventDate}, ${timeLabel(eventTime)}.`,
          }, request);
          await writeAdminAudit({ adminId, action: 'BOOKING_RESCHEDULED', entityType: 'BOOKING', entityId: reservationId,
            oldValues: { eventDate: booking.eventDate, eventTime: booking.eventTime }, newValues: { eventDate, eventTime } }, request);
          await queueBookingNotification(reservationId, 'BOOKING_RESCHEDULED', request, { eventTime });
          return { eventDate, eventTime };
        });
      } catch (error) {
        if (error instanceof Error && 'number' in error && error.number === 1205) {
          throw new AppError(409, 'Another booking changed while checking availability. Please try saving again.', 'BOOKING_SCHEDULE_BUSY');
        }
        throw error;
      }
    },
  };
}
export const bookingTimeService = createBookingTimeService();
