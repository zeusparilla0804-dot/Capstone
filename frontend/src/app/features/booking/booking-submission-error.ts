import { HttpErrorResponse } from '@angular/common/http';
import { BookingSubmissionConflictError } from '../../core/services/booking.service';

const GENERIC_MESSAGE = "We couldn't submit your booking. Please try again.";
const CAPACITY_CONFLICT_CODES = new Set(['BOOKING_DATE_FULL', 'CAPACITY_CHANGED']);

export function bookingSubmissionCode(error: unknown): string | undefined {
  if (!(error instanceof HttpErrorResponse)) return undefined;
  return typeof error.error?.code === 'string' ? error.error.code : undefined;
}

export function isBookingCapacityConflict(error: unknown): boolean {
  const code = bookingSubmissionCode(error);
  return error instanceof HttpErrorResponse
    && error.status === 409
    && code !== undefined
    && CAPACITY_CONFLICT_CODES.has(code);
}

export function bookingSubmissionMessage(error: unknown): string {
  if (error instanceof BookingSubmissionConflictError) return error.message;
  if (!(error instanceof HttpErrorResponse)) return GENERIC_MESSAGE;
  if (error.status === 0) {
    return 'Cannot connect to LA Chef. Make sure the backend is running, then try again.';
  }
  return typeof error.error?.message === 'string' && error.error.message.trim()
    ? error.error.message
    : GENERIC_MESSAGE;
}
