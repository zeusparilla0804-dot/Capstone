import type { PackageInput } from '../types/admin.types.js';
import { AppError } from '../utils/app-error.js';
import { finiteMoney, identifier, text } from '../utils/validation.js';

function optionalInteger(value: unknown, name: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10_000) {
    throw new AppError(400, `${name} is invalid.`);
  }
  return parsed;
}

function optionalMoney(value: unknown, name: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  return finiteMoney(value, name, true);
}

function optionalDescription(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > 1_000) {
    throw new AppError(400, 'Description is invalid.');
  }
  return value.trim();
}

export function normalizePackageInput(rawInput: unknown): PackageInput {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    throw new AppError(400, 'Package details are invalid.');
  }
  const raw = rawInput as Record<string, unknown>;
  const eventId = identifier(raw['eventId'], 'Event identifier');
  const name = text(raw['name'], 'Package name', { max: 150 });
  const description = optionalDescription(raw['description']);
  const minGuests = optionalInteger(raw['minGuests'], 'Minimum guests');
  const maxGuests = optionalInteger(raw['maxGuests'], 'Maximum guests');
  if (minGuests !== null && maxGuests !== null && maxGuests < minGuests) {
    throw new AppError(400, 'Maximum guests must be greater than or equal to minimum guests.');
  }
  if (typeof raw['isActive'] !== 'boolean') {
    throw new AppError(400, 'Active status must be true or false.');
  }

  const pricingType = raw['pricingType'];
  const pricePerGuest = optionalMoney(raw['pricePerGuest'], 'Price per guest');
  const basePrice = optionalMoney(raw['basePrice'], 'Base price');
  const includedGuests = optionalInteger(raw['includedGuests'], 'Included guests');
  const excessGuestPrice = optionalMoney(raw['excessGuestPrice'], 'Excess guest price');
  const common = { eventId, name, description, minGuests, maxGuests, isActive: raw['isActive'] };

  if (pricingType === 'PER_HEAD') {
    if (pricePerGuest === null || basePrice !== null || includedGuests !== null || excessGuestPrice !== null) {
      throw new AppError(400, 'Per-head package pricing is invalid.');
    }
    return {
      ...common,
      pricingType,
      pricePerGuest,
      basePrice: null,
      includedGuests: null,
      excessGuestPrice: null,
    };
  }

  if (pricingType === 'BASE_PLUS_EXCESS') {
    if (pricePerGuest !== null || basePrice === null || includedGuests === null || excessGuestPrice === null) {
      throw new AppError(400, 'Base-plus-excess package pricing is invalid.');
    }
    return {
      ...common,
      pricingType,
      pricePerGuest: null,
      basePrice,
      includedGuests,
      excessGuestPrice,
    };
  }

  throw new AppError(400, 'Package pricing type is invalid.');
}
