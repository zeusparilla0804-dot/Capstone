import { EventTimePipe, eventTime24, formatEventTime } from './event-time.pipe';

describe('12-hour event time', () => {
  it.each([
    ['00:00', '12:00 AM'], ['00:05:00.0000000', '12:05 AM'], ['09:05', '9:05 AM'],
    ['12:00', '12:00 PM'], ['13:05', '1:05 PM'], ['18:00', '6:00 PM'], ['23:59', '11:59 PM'],
    ['7:00 PM', '7:00 PM'], [' 07:05 pm ', '7:05 PM'],
  ])('displays %s as %s without changing time zones', (value, label) => {
    expect(formatEventTime(value)).toBe(label);
    expect(new EventTimePipe().transform(value)).toBe(label);
  });
  it('converts editable AM/PM values to the existing API clock format', () => {
    expect(eventTime24('12:00 AM')).toBe('00:00');
    expect(eventTime24('12:00 PM')).toBe('12:00');
    expect(eventTime24('10:35 PM')).toBe('22:35');
    expect(eventTime24('7 PM')).toBe('19:00');
    for (const value of ['13:00 PM', '00:00 AM', '24:00', '9:99 AM', '']) expect(eventTime24(value)).toBeNull();
    expect(formatEventTime(undefined)).toBe('Time not provided');
  });
});
