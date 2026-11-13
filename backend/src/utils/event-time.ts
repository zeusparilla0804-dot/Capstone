export function formatEventTime(value: string | null | undefined, empty = 'Time not provided'): string {
  if (!value) return empty;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function formatEventTimeChange(detail: string): string {
  return detail.replace(/\b(?:[01]\d|2[0-3]):[0-5]\d\b(?!\s*[AP]M)/gi, time => formatEventTime(time));
}
