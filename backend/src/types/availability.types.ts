export type AvailabilityStatus = 'AVAILABLE' | 'LIMITED' | 'NEEDS_CONFIRMATION' | 'FULL';

export interface CapacitySnapshot {
  readonly activeBookingCount: number;
  readonly largestGuestCount: number;
  readonly hasMediumEvent: boolean;
}

export interface BookingAvailability {
  readonly date: string;
  readonly guestCount: number;
  readonly status: AvailabilityStatus;
  readonly activeBookingCount: number;
  readonly capacityLimit: number;
  readonly remainingRequestSlots: number;
  readonly requiresAdminConfirmation: boolean;
  readonly message: string;
}

export interface AssessDateAvailabilityInput {
  readonly date: string;
  readonly guestCount: number;
  readonly snapshot: CapacitySnapshot;
  readonly includeProposed: boolean;
}
