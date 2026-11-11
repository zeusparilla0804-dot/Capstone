import { AppError } from '../utils/app-error.js';

export const BOOKING_EVENT_TYPES = ['wedding', 'birthday', 'corporate', 'debut', 'anniversary', 'other'] as const;
type BookingEventType = typeof BOOKING_EVENT_TYPES[number];

const EVENT_RESTRICTIONS: Readonly<Record<string, readonly BookingEventType[]>> = {
  'host or magician': ['birthday', 'debut'],
  'airbrush hair and makeup upgrade': ['wedding', 'debut'],
};

export function addOnEventTypes(name: string): readonly BookingEventType[] {
  return EVENT_RESTRICTIONS[name.trim().toLowerCase()] ?? BOOKING_EVENT_TYPES;
}

export function addOnAvailableForEvent(name: string, eventType: string): boolean {
  return addOnEventTypes(name).includes(eventType.trim().toLowerCase() as BookingEventType);
}

export function assertAddOnsMatchEvent(addOns: readonly { name: string }[], eventType: string): void {
  if (addOns.some(addOn => !addOnAvailableForEvent(addOn.name, eventType))) {
    throw new AppError(400, 'One or more add-ons are not available for this event type.');
  }
}
