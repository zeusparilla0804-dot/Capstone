import type sql from 'mssql';
import { writeAdminAudit } from '../repositories/audit.repository.js';
import { insertBookingStatusHistory, lockedBookingStatus, runBookingStatusTransaction, setBookingStatusIfCurrent } from '../repositories/booking-status.repository.js';
import type { BookingActor, BookingStatus } from '../types/admin.types.js';
import { AppError } from '../utils/app-error.js';
import { queueBookingNotification } from './notification.service.js';
import { readCapacitySnapshot } from '../repositories/booking-availability.repository.js';
import { assessDateAvailability } from './booking-availability.service.js';

const transitions: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['AWAITING_PAYMENT', 'CANCELLED'],
  AWAITING_PAYMENT: ['PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CANCELLED'],
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
  expectedStatus?: BookingStatus;
  mode?: 'GENERIC_ADMIN';
  capacityConfirmed?: boolean;
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
  if (input.expectedStatus !== undefined && !Object.hasOwn(transitions, input.expectedStatus)) {
    throw new AppError(400, 'Expected booking status is invalid.');
  }
  if (input.mode === 'GENERIC_ADMIN' && input.actor.type !== 'ADMIN') {
    throw new AppError(400, 'Booking actor is invalid for this action.');
  }
  if (input.mode === 'GENERIC_ADMIN' && (input.nextStatus === 'PAYMENT_SUBMITTED' || input.nextStatus === 'PAYMENT_VERIFIED')) {
    throw new AppError(409, 'Payment status changes require the payment proof workflow.');
  }
  if (input.reason !== undefined && typeof input.reason !== 'string') {
    throw new AppError(400, 'Booking reason is invalid.');
  }
  if (input.capacityConfirmed !== undefined && typeof input.capacityConfirmed !== 'boolean') {
    throw new AppError(400, 'Capacity confirmation must be true or false.');
  }
  const reason = input.reason?.trim();
  if (reason && reason.length > 1000) throw new AppError(400, 'Booking reason is too long.');
  if ((input.nextStatus === 'REJECTED' || input.nextStatus === 'CANCELLED') && !reason) {
    throw new AppError(400, 'A reason is required for rejection or cancellation.');
  }

  const work = async (request: sql.Request) => {
    const current = await lockedBookingStatus(input.reservationId, request);
    if (!current || (input.actor.type === 'CUSTOMER' && current.customerId !== input.actor.id)) throw new AppError(404, 'Booking not found.');
    const previousStatus = current.status;
    if (input.expectedStatus && previousStatus !== input.expectedStatus) throw new AppError(409, 'Booking status changed. Refresh and try again.');
    if (input.mode === 'GENERIC_ADMIN' && previousStatus === 'PAYMENT_SUBMITTED') {
      throw new AppError(409, 'Payment proof decisions require the payment proof workflow.');
    }
    if (!allowedBookingTransitions(previousStatus).includes(input.nextStatus)) {
      throw new AppError(409, `Cannot change ${previousStatus} booking to ${input.nextStatus}.`);
    }
    let capacityWasConfirmed = false;
    if (previousStatus === 'PENDING' && input.nextStatus === 'APPROVED') {
      const snapshot = await readCapacitySnapshot(current.eventDate, { request, lock: true });
      const availability = assessDateAvailability({
        date: current.eventDate,
        guestCount: current.guestCount,
        snapshot,
        includeProposed: false,
      });
      if (availability.status === 'FULL') {
        throw new AppError(409, 'Date capacity changed. Refresh the booking and review it again.', 'CAPACITY_CHANGED');
      }
      if (availability.requiresAdminConfirmation && input.capacityConfirmed !== true) {
        throw new AppError(400, 'Confirm that LA Chef can accommodate this event before approval.', 'CAPACITY_CONFIRMATION_REQUIRED');
      }
      capacityWasConfirmed = availability.requiresAdminConfirmation && input.capacityConfirmed === true;
    }
    if (!await setBookingStatusIfCurrent(input.reservationId, previousStatus, input.nextStatus, request, input.actor.type === 'CUSTOMER' ? input.actor.id : undefined)) {
      throw new AppError(409, 'Booking status changed. Refresh and try again.');
    }
    await insertBookingStatusHistory({ reservationId: input.reservationId, previousStatus, nextStatus: input.nextStatus, actor: input.actor, reason }, request);
    if (input.actor.type === 'ADMIN') {
      await writeAdminAudit({ adminId: input.actor.id, action: 'BOOKING_STATUS_CHANGED', entityType: 'BOOKING', entityId: input.reservationId,
        oldValues: { status: previousStatus }, newValues: { status: input.nextStatus, reason: reason ?? null,
          ...(capacityWasConfirmed ? { capacityConfirmed: true } : {}) } }, request);
    }
    const notification = ({ APPROVED: 'BOOKING_APPROVED', REJECTED: 'BOOKING_REJECTED', CONFIRMED: 'BOOKING_CONFIRMED',
      CANCELLED: 'BOOKING_CANCELLED', COMPLETED: 'BOOKING_COMPLETED' } as const)[input.nextStatus as 'APPROVED' | 'REJECTED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'];
    if (notification) await queueBookingNotification(input.reservationId, notification, request);
  };
  if (input.request) await work(input.request);
  else await runBookingStatusTransaction(work);
}
