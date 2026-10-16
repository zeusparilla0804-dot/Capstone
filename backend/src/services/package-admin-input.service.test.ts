import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../utils/app-error.js';
import { normalizePackageInput } from './package-admin-input.service.js';

const common = {
  eventId: 2,
  name: 'Amethyst Package',
  description: 'Debut package',
  minGuests: null,
  maxGuests: null,
  isActive: true,
};

test('normalizes a per-head package with nullable client-unconfirmed limits', () => {
  assert.deepEqual(normalizePackageInput({
    ...common,
    pricingType: 'PER_HEAD',
    pricePerGuest: 480,
    basePrice: null,
    includedGuests: null,
    excessGuestPrice: null,
  }), {
    ...common,
    pricingType: 'PER_HEAD',
    pricePerGuest: 480,
    basePrice: null,
    includedGuests: null,
    excessGuestPrice: null,
  });
});

test('normalizes a base-plus-excess package using the supplied debut formula', () => {
  assert.deepEqual(normalizePackageInput({
    ...common,
    pricingType: 'BASE_PLUS_EXCESS',
    pricePerGuest: null,
    basePrice: 85_888,
    includedGuests: 50,
    excessGuestPrice: 650,
  }), {
    ...common,
    pricingType: 'BASE_PLUS_EXCESS',
    pricePerGuest: null,
    basePrice: 85_888,
    includedGuests: 50,
    excessGuestPrice: 650,
  });
});

test('rejects mixed or incomplete pricing fields', () => {
  for (const input of [
    { ...common, pricingType: 'PER_HEAD', pricePerGuest: 480, basePrice: 1, includedGuests: null, excessGuestPrice: null },
    { ...common, pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 85_888, includedGuests: null, excessGuestPrice: 650 },
    { ...common, pricingType: 'UNKNOWN', pricePerGuest: 480, basePrice: null, includedGuests: null, excessGuestPrice: null },
  ]) {
    assert.throws(
      () => normalizePackageInput(input),
      (error) => error instanceof AppError && error.statusCode === 400,
    );
  }
});

test('rejects invalid guest bounds and non-boolean active status', () => {
  const valid = {
    ...common,
    pricingType: 'PER_HEAD',
    pricePerGuest: 480,
    basePrice: null,
    includedGuests: null,
    excessGuestPrice: null,
  };
  assert.throws(() => normalizePackageInput({ ...valid, minGuests: 100, maxGuests: 50 }), AppError);
  assert.throws(() => normalizePackageInput({ ...valid, isActive: 'true' }), AppError);
});
