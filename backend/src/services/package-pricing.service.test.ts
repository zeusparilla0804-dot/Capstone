import assert from 'node:assert/strict';
import test from 'node:test';
import type { PackageRecord, PackagePricingType } from '../types/domain.types.js';
import { AppError } from '../utils/app-error.js';
import { assertGuestCountAllowed, calculatePackagePrice } from './package-pricing.service.js';

function packageRecord(
  pricingType: PackagePricingType,
  values: Partial<PackageRecord> = {},
): PackageRecord {
  return {
    id: 1,
    name: 'LA Chef package',
    category: 'debut',
    description: '',
    pricingType,
    pricePerGuest: pricingType === 'PER_HEAD' ? 480 : null,
    basePrice: pricingType === 'BASE_PLUS_EXCESS' ? 85_888 : null,
    includedGuests: pricingType === 'BASE_PLUS_EXCESS' ? 50 : null,
    excessGuestPrice: pricingType === 'BASE_PLUS_EXCESS' ? 650 : null,
    minGuests: null,
    maxGuests: null,
    features: [],
    ...values,
  };
}

for (const [rate, guests, expected] of [
  [480, 73, 35_040],
  [580, 125, 72_500],
  [680, 149, 101_320],
] as const) {
  test(`calculates the supplied PHP ${rate} per-head tier`, () => {
    const result = calculatePackagePrice(
      packageRecord('PER_HEAD', { pricePerGuest: rate }),
      guests,
    );

    assert.equal(result.packageTotal, expected);
    assert.deepEqual(result.pricingSnapshot, {
      pricingType: 'PER_HEAD',
      pricePerGuest: rate,
      basePrice: null,
      includedGuests: null,
      excessGuestPrice: null,
      packageTotal: expected,
    });
  });
}

for (const [name, basePrice, includedGuests, excessGuestPrice] of [
  ['Amethyst', 85_888, 50, 650],
  ['Diamond', 138_888, 100, 750],
  ['Ruby', 198_888, 120, 850],
] as const) {
  test(`${name} charges its base through the included guest boundary`, () => {
    const item = packageRecord('BASE_PLUS_EXCESS', {
      name,
      basePrice,
      includedGuests,
      excessGuestPrice,
    });

    assert.equal(calculatePackagePrice(item, includedGuests - 1).packageTotal, basePrice);
    assert.equal(calculatePackagePrice(item, includedGuests).packageTotal, basePrice);
  });

  test(`${name} charges exactly one excess rate above its included guests`, () => {
    const item = packageRecord('BASE_PLUS_EXCESS', {
      name,
      basePrice,
      includedGuests,
      excessGuestPrice,
    });

    const result = calculatePackagePrice(item, includedGuests + 1);
    assert.equal(result.packageTotal, basePrice + excessGuestPrice);
    assert.deepEqual(result.pricingSnapshot, {
      pricingType: 'BASE_PLUS_EXCESS',
      pricePerGuest: null,
      basePrice,
      includedGuests,
      excessGuestPrice,
      packageTotal: basePrice + excessGuestPrice,
    });
  });
}

test('rounds calculated totals to SQL money precision', () => {
  const result = calculatePackagePrice(
    packageRecord('PER_HEAD', { pricePerGuest: 480.55 }),
    3,
  );
  assert.equal(result.packageTotal, 1_441.65);
});

test('nullable client-unconfirmed guest limits do not block a valid estimate', () => {
  const item = packageRecord('PER_HEAD', { minGuests: null, maxGuests: null });
  assert.doesNotThrow(() => assertGuestCountAllowed(item, 1));
  assert.doesNotThrow(() => assertGuestCountAllowed(item, 10_000));
});

test('confirmed package guest limits reject estimates outside the range', () => {
  const item = packageRecord('PER_HEAD', { minGuests: 50, maxGuests: 150 });

  for (const guests of [49, 151]) {
    assert.throws(
      () => assertGuestCountAllowed(item, guests),
      (error) => error instanceof AppError
        && error.statusCode === 400
        && error.code === 'PACKAGE_GUEST_LIMIT'
        && error.message === 'Estimated guest count must be between 50 and 150.',
    );
  }
});

test('universal guest boundary rejects non-integers and values outside 1-10000', () => {
  const item = packageRecord('PER_HEAD');
  for (const guests of [0, 10_001, 1.5, Number.NaN]) {
    assert.throws(
      () => assertGuestCountAllowed(item, guests),
      (error) => error instanceof AppError
        && error.statusCode === 400
        && error.code === 'GUEST_COUNT_INVALID',
    );
  }
});

test('rejects incomplete persisted pricing models instead of producing a false total', () => {
  assert.throws(
    () => calculatePackagePrice(packageRecord('PER_HEAD', { pricePerGuest: null }), 50),
    (error) => error instanceof AppError && error.code === 'PACKAGE_PRICING_INVALID',
  );
  assert.throws(
    () => calculatePackagePrice(
      packageRecord('BASE_PLUS_EXCESS', { excessGuestPrice: null }),
      51,
    ),
    (error) => error instanceof AppError && error.code === 'PACKAGE_PRICING_INVALID',
  );
});
