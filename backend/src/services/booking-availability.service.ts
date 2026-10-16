import type {
  AssessDateAvailabilityInput,
  AvailabilityStatus,
  BookingAvailability,
} from '../types/availability.types.js';
import type sql from 'mssql';
import {
  readCapacitySnapshot,
  type CapacitySnapshotOptions,
} from '../repositories/booking-availability.repository.js';
import { AppError } from '../utils/app-error.js';

function isMediumEvent(guestCount: number): boolean {
  return guestCount >= 150 && guestCount <= 499;
}

function capacityLimit(largestGuestCount: number): number {
  if (largestGuestCount >= 1_000) return 1;
  if (largestGuestCount >= 500) return 3;
  return 6;
}

function availabilityMessage(status: AvailabilityStatus): string {
  if (status === 'FULL') return 'This date is fully booked for the requested event size.';
  if (status === 'NEEDS_CONFIRMATION') return 'LA Chef will confirm whether this date can accommodate your event.';
  if (status === 'LIMITED') return 'This request would take the final available slot for this date.';
  return 'This date is available for your event.';
}

export function assessDateAvailability(input: AssessDateAvailabilityInput): BookingAvailability {
  const proposedCount = input.includeProposed ? 1 : 0;
  const bookingCount = input.snapshot.activeBookingCount + proposedCount;
  const largestGuestCount = input.includeProposed
    ? Math.max(input.snapshot.largestGuestCount, input.guestCount)
    : input.snapshot.largestGuestCount;
  const limit = capacityLimit(largestGuestCount);
  const remainingRequestSlots = Math.max(limit - bookingCount, 0);
  const hasMediumEvent = input.snapshot.hasMediumEvent || (input.includeProposed && isMediumEvent(input.guestCount));
  const status: AvailabilityStatus = bookingCount > limit
    ? 'FULL'
    : hasMediumEvent
      ? 'NEEDS_CONFIRMATION'
      : bookingCount === limit
        ? 'LIMITED'
        : 'AVAILABLE';

  return {
    date: input.date,
    guestCount: input.guestCount,
    status,
    activeBookingCount: input.snapshot.activeBookingCount,
    capacityLimit: limit,
    remainingRequestSlots,
    requiresAdminConfirmation: isMediumEvent(input.guestCount),
    message: availabilityMessage(status),
  };
}

interface BookingAvailabilityDependencies {
  readCapacitySnapshot(
    eventDate: string,
    options?: CapacitySnapshotOptions,
  ): Promise<AssessDateAvailabilityInput['snapshot']>;
}

export function createBookingAvailabilityService(deps: BookingAvailabilityDependencies) {
  return {
    async preview(date: string, guestCount: number): Promise<BookingAvailability> {
      try {
        const snapshot = await deps.readCapacitySnapshot(date);
        return assessDateAvailability({ date, guestCount, snapshot, includeProposed: true });
      } catch {
        throw new AppError(
          503,
          'Date availability is temporarily unavailable. Please try again.',
          'AVAILABILITY_UNAVAILABLE',
        );
      }
    },

    async assertCanAccept(
      date: string,
      guestCount: number,
      request: sql.Request,
      excludeReservationId?: number,
    ): Promise<BookingAvailability> {
      const options: CapacitySnapshotOptions = { request, lock: true };
      if (excludeReservationId !== undefined) options.excludeReservationId = excludeReservationId;
      const snapshot = await deps.readCapacitySnapshot(date, options);
      const availability = assessDateAvailability({
        date,
        guestCount,
        snapshot,
        includeProposed: true,
      });
      if (availability.status === 'FULL') {
        throw new AppError(409, availability.message, 'BOOKING_DATE_FULL');
      }
      return availability;
    },

    async summarizeExisting(
      date: string,
      guestCount: number,
      request?: sql.Request,
    ): Promise<BookingAvailability> {
      const snapshot = request
        ? await deps.readCapacitySnapshot(date, { request })
        : await deps.readCapacitySnapshot(date);
      return assessDateAvailability({ date, guestCount, snapshot, includeProposed: false });
    },
  };
}

export const bookingAvailabilityService = createBookingAvailabilityService({
  readCapacitySnapshot,
});
