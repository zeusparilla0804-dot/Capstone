import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';

const { mapPackageRows } = await import('./catalog.repository.js');

test('maps per-head and base-plus-excess catalog rows without coercing nullable limits', () => {
  const packages = mapPackageRows([
    {
      package_id: 1,
      package_name: 'PHP 480 Catering Package',
      description: 'Standard catering',
      pricing_type: 'PER_HEAD',
      price_per_head: 480,
      base_price: null,
      included_guests: null,
      excess_guest_price: null,
      min_guest: null,
      max_guest: null,
      event_type: 'Wedding',
      item_name: 'Steamed rice',
    },
    {
      package_id: 1,
      package_name: 'PHP 480 Catering Package',
      description: 'Standard catering',
      pricing_type: 'PER_HEAD',
      price_per_head: 480,
      base_price: null,
      included_guests: null,
      excess_guest_price: null,
      min_guest: null,
      max_guest: null,
      event_type: 'Wedding',
      item_name: 'Three main dishes',
    },
    {
      package_id: 2,
      package_name: 'Amethyst Package',
      description: 'Debut package',
      pricing_type: 'BASE_PLUS_EXCESS',
      price_per_head: null,
      base_price: 85_888,
      included_guests: 50,
      excess_guest_price: 650,
      min_guest: null,
      max_guest: null,
      event_type: 'Debut',
      item_name: null,
    },
  ]);

  assert.deepEqual(packages, [
    {
      id: 1,
      name: 'PHP 480 Catering Package',
      category: 'wedding',
      description: 'Standard catering',
      pricingType: 'PER_HEAD',
      pricePerGuest: 480,
      basePrice: null,
      includedGuests: null,
      excessGuestPrice: null,
      minGuests: null,
      maxGuests: null,
      features: [{ label: 'Steamed rice' }, { label: 'Three main dishes' }],
    },
    {
      id: 2,
      name: 'Amethyst Package',
      category: 'debut',
      description: 'Debut package',
      pricingType: 'BASE_PLUS_EXCESS',
      pricePerGuest: null,
      basePrice: 85_888,
      includedGuests: 50,
      excessGuestPrice: 650,
      minGuests: null,
      maxGuests: null,
      features: [],
    },
  ]);
});
