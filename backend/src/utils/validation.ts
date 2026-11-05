import { AppError } from './app-error.js';

export function identifier(value: unknown, name = 'Identifier'): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new AppError(400, `${name} is invalid.`);
  return parsed;
}

export function text(value: unknown, name: string, options: { min?: number; max: number }): string {
  if (typeof value !== 'string') throw new AppError(400, `${name} is required.`);
  const normalized = value.trim();
  if (normalized.length < (options.min ?? 1) || normalized.length > options.max) {
    throw new AppError(400, `${name} must be between ${options.min ?? 1} and ${options.max} characters.`);
  }
  return normalized;
}

export function emailAddress(value: unknown): string {
  const email = text(value, 'Email', { max: 255 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'Email is invalid.');
  return email;
}

export function philippineMobileNumber(value: unknown): string {
  const phone = text(value, 'Phone', { max: 30 });
  if (!/^(?:09|\+639)[0-9]{2} ?[0-9]{3} ?[0-9]{4}$/.test(phone)) {
    throw new AppError(400, 'Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).');
  }
  return phone.replaceAll(' ', '');
}

export function isoDate(value: unknown, name: string, futureOnly = false): string {
  const date = text(value, name, { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(400, `${name} is invalid.`);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new AppError(400, `${name} is invalid.`);
  }
  if (futureOnly && date <= new Date().toISOString().slice(0, 10)) {
    throw new AppError(400, `${name} must be in the future.`);
  }
  return date;
}

export function time24(value: unknown): string {
  const time = text(value, 'Event time', { max: 5 });
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new AppError(400, 'Event time is invalid.');
  return time;
}

export function finiteMoney(value: unknown, name: string, allowZero = false): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < (allowZero ? 0 : 0.01) || amount > 99_999_999.99) {
    throw new AppError(400, `${name} is invalid.`);
  }
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
