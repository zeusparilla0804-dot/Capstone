import { TestBed } from '@angular/core/testing';
import type { CateringPackage } from '../models';
import { BookingCalculationService } from './booking-calculation.service';

const packageRecord = (overrides: Partial<CateringPackage>): CateringPackage => ({
  id: '1', name: 'Package', category: 'wedding', description: 'Package description',
  pricingType: 'PER_HEAD', pricePerGuest: 480, basePrice: null, includedGuests: null,
  excessGuestPrice: null, minGuests: null, maxGuests: null,
  imageUrl: 'assets/images/packages/wedding/wedding-wide.png', features: [],
  ...overrides,
});

describe('BookingCalculationService package pricing', () => {
  const service = TestBed.inject(BookingCalculationService);

  it('calculates per-head pricing with add-ons, discount, and down payment', () => {
    expect(service.calculatePackagePricing(
      packageRecord({ pricePerGuest: 580 }),
      100,
      [{ id: '5', name: 'Coffee Bar', price: 15_000 }],
      3_000,
    )).toEqual({
      packageTotal: 58_000,
      addOnTotal: 15_000,
      subtotal: 73_000,
      discount: 3_000,
      total: 70_000,
      downPayment: 35_000,
      remainingBalance: 35_000,
    });
  });

  it('uses the base price through the included guest boundary', () => {
    const pkg = packageRecord({
      pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 85_888,
      includedGuests: 50, excessGuestPrice: 650,
    });

    expect(service.calculatePackagePricing(pkg, 49, []).packageTotal).toBe(85_888);
    expect(service.calculatePackagePricing(pkg, 50, []).packageTotal).toBe(85_888);
    expect(service.calculatePackagePricing(pkg, 51, []).packageTotal).toBe(86_538);
  });

  it('rounds package and payment amounts to currency cents', () => {
    const result = service.calculatePackagePricing(packageRecord({ pricePerGuest: 480.55 }), 3, [], 0, 1 / 3);

    expect(result.packageTotal).toBe(1_441.65);
    expect(result.downPayment).toBe(480.55);
    expect(result.remainingBalance).toBe(961.1);
  });
});
