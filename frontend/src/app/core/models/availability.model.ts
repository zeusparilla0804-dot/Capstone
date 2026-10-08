export type AvailabilityStatus = 'AVAILABLE' | 'LIMITED' | 'NEEDS_CONFIRMATION' | 'FULL';

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
