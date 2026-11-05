import { createHash } from 'node:crypto';
import type { CreateBookingDto } from '../types/domain.types.js';
import { AppError } from '../utils/app-error.js';

export function parseBookingSubmissionKey(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError(400, 'Idempotency-Key must be a UUID version 4.');
  }
  return value.toLowerCase();
}

export function bookingSubmissionHash(dto: CreateBookingDto): string {
  const addOns = [...dto.addOnIds].sort((left, right) => left - right)
    .map(id => [id, dto.addOnQuantities?.[String(id)] ?? 1]);
  const canonical = {
    eventType: dto.eventType, eventDate: dto.eventDate, eventTime: dto.eventTime,
    venue: dto.venue, guestCount: dto.guestCount, packageId: dto.packageId, addOns,
    paymentMethod: dto.paymentMethod ?? null, specialRequest: dto.specialRequest ?? null,
  };
  return createHash('sha256').update('booking-create:v1:').update(JSON.stringify(canonical)).digest('hex');
}

export function assertCustomerBookingDate(date: string): void {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const minimum = new Date(`${today}T00:00:00Z`);
  minimum.setUTCDate(minimum.getUTCDate() + 3);
  if (date < minimum.toISOString().slice(0, 10)) {
    throw new AppError(400, 'Unavailable Date. Please select a date at least 3 days in advance.');
  }
}
