import { Pipe, PipeTransform } from '@angular/core';

/** Calendar clock values have no time zone; format them without Date conversion. */
export function eventTime24(value: string | null | undefined): string | null {
  const text = value?.trim() ?? '';
  const clock = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/.exec(text);
  if (clock) return `${clock[1]}:${clock[2]}`;
  const display = /^(0?[1-9]|1[0-2])(?::([0-5]\d))?\s*(AM|PM)$/i.exec(text);
  if (!display) return null;
  const hour = Number(display[1]) % 12 + (display[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${display[2] ?? '00'}`;
}

export function formatEventTime(value: string | null | undefined): string {
  const clock = eventTime24(value);
  if (!clock) return value?.trim() || 'Time not provided';
  const hour = Number(clock.slice(0, 2));
  return `${hour % 12 || 12}:${clock.slice(3)} ${hour < 12 ? 'AM' : 'PM'}`;
}

@Pipe({ name: 'eventTime' })
export class EventTimePipe implements PipeTransform {
  transform(value: string | null | undefined): string { return formatEventTime(value); }
}
