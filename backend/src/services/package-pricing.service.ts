import type { PackagePricingSnapshot, PackageRecord } from '../types/domain.types.js';
import { AppError } from '../utils/app-error.js';

const MAX_GUESTS = 10_000;

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validMoney(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function invalidPricing(): never {
  throw new AppError(500, 'Package pricing is unavailable.', 'PACKAGE_PRICING_INVALID');
}

export function assertGuestCountAllowed(pkg: PackageRecord, guestCount: number): void {
  if (!Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > MAX_GUESTS) {
    throw new AppError(400, 'Estimated guest count must be from 1 to 10,000.', 'GUEST_COUNT_INVALID');
  }

  if (pkg.minGuests !== null && guestCount < pkg.minGuests) {
    const message = pkg.maxGuests === null
      ? `Estimated guest count must be at least ${pkg.minGuests}.`
      : `Estimated guest count must be between ${pkg.minGuests} and ${pkg.maxGuests}.`;
    throw new AppError(400, message, 'PACKAGE_GUEST_LIMIT');
  }

  if (pkg.maxGuests !== null && guestCount > pkg.maxGuests) {
    const message = pkg.minGuests === null
      ? `Estimated guest count must not exceed ${pkg.maxGuests}.`
      : `Estimated guest count must be between ${pkg.minGuests} and ${pkg.maxGuests}.`;
    throw new AppError(400, message, 'PACKAGE_GUEST_LIMIT');
  }
}

export function calculatePackagePrice(
  pkg: PackageRecord,
  guestCount: number,
): { packageTotal: number; pricingSnapshot: PackagePricingSnapshot } {
  assertGuestCountAllowed(pkg, guestCount);

  if (pkg.pricingType === 'PER_HEAD') {
    if (!validMoney(pkg.pricePerGuest)) invalidPricing();
    const packageTotal = money(pkg.pricePerGuest * guestCount);
    return {
      packageTotal,
      pricingSnapshot: {
        pricingType: 'PER_HEAD',
        pricePerGuest: pkg.pricePerGuest,
        basePrice: null,
        includedGuests: null,
        excessGuestPrice: null,
        packageTotal,
      },
    };
  }

  if (
    pkg.pricingType !== 'BASE_PLUS_EXCESS'
    || !validMoney(pkg.basePrice)
    || !Number.isSafeInteger(pkg.includedGuests)
    || pkg.includedGuests === null
    || pkg.includedGuests < 1
    || !validMoney(pkg.excessGuestPrice)
  ) invalidPricing();

  const packageTotal = money(
    pkg.basePrice + Math.max(guestCount - pkg.includedGuests, 0) * pkg.excessGuestPrice,
  );
  return {
    packageTotal,
    pricingSnapshot: {
      pricingType: 'BASE_PLUS_EXCESS',
      pricePerGuest: null,
      basePrice: pkg.basePrice,
      includedGuests: pkg.includedGuests,
      excessGuestPrice: pkg.excessGuestPrice,
      packageTotal,
    },
  };
}
