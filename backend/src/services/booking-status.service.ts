import type sql from 'mssql';
import { writeAdminAudit } from '../repositories/audit.repository.js';
import { insertBookingStatusHistory, lockedBookingStatus, runBookingStatusTransaction, setBookingStatusIfCurrent } from '../repositories/booking-status.repository.js';
import type { BookingActor, BookingStatus } from '../types/admin.types.js';
import { AppError } from '../utils/app-error.js';

const transitions: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['AWAITING_PAYMENT', 'CANCELLED'],
  AWAITING_PAYMENT: ['PAYMENT_SUBMITTED', 'CANCELLED'],
  PAYMENT_SUBMITTED: ['PAYMENT_VERIFIED', 'AWAITING_PAYMENT'],
  PAYMENT_VERIFIED: ['CONFIRMED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: []
};

export function allowedBookingTransitions(status: BookingStatus): readonly BookingStatus[] {
  return transitions[status] ?? [];
}

export interface BookingTransitionInput {
  reservationId: number;
  nextStatus: BookingStatus;
  actor: BookingActor;
  reason?: string;
  request?: sql.Request;
}

export async function transitionBooking(input: BookingTransitionInput): Promise<void> {
  if (!Number.isSafeInteger(input.reservationId) || input.reservationId < 1 || !Object.hasOwn(transitions, input.nextStatus)) {
    throw new AppError(400, 'Booking transition is invalid.');
  }
  if (!input.actor || !['ADMIN', 'CUSTOMER', 'SYSTEM'].includes(input.actor.type) ||
      (input.actor.type === 'SYSTEM' ? input.actor.id !== undefined : !Number.isSafeInteger(input.actor.id) || input.actor.id < 1)) {
    throw new AppError(400, 'Booking actor is invalid.');
  }
  if (input.reason !== undefined && (typeof input.reason !== 'string' || input.reason.length > 1000)) {
    throw new AppError(400, 'Booking reason is invalid.');
  }
  const reason = input.reason?.trim();
  if ((input.nextStatus === 'REJECTED' || input.nextStatus === 'CANCELLED') && !reason) {
    throw new AppError(400, 'A reason is required for rejection or cancellation.');
  }

  const work = async (request: sql.Request) => {
    const previousStatus = await lockedBookingStatus(input.reservationId, request);
    if (!previousStatus) throw new AppError(404, 'Booking not found.');
    if (!allowedBookingTransitions(previousStatus).includes(input.nextStatus)) {
      throw new AppError(409, `Cannot change ${previousStatus} booking to ${input.nextStatus}.`);
    }
    if (!await setBookingStatusIfCurrent(input.reservationId, previousStatus, input.nextStatus, request)) {
      throw new AppError(409, 'Booking status changed. Refresh and try again.');
    }
    await insertBookingStatusHistory({ reservationId: input.reservationId, previousStatus, nextStatus: input.nextStatus, actor: input.actor, reason }, request);
    if (input.actor.type === 'ADMIN') {
      await writeAdminAudit({ adminId: input.actor.id, action: 'BOOKING_STATUS_CHANGED', entityType: 'BOOKING', entityId: input.reservationId,
        oldValues: { status: previousStatus }, newValues: { status: input.nextStatus, reason: reason ?? null } }, request);
    }
  };
  if (input.request) await work(input.request);
  else await runBookingStatusTransaction(work);
}
