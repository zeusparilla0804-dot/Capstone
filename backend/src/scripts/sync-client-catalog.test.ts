import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const catalogSync = await import('./sync-client-catalog.js');

test('client catalog defines the supplied standard, wedding and debut package rates', () => {
  assert.deepEqual(catalogSync.CLIENT_PACKAGE_DEFINITIONS.map((item) => ({
    name: item.name,
    eventType: item.eventType,
    pricingType: item.pricingType,
    pricePerGuest: item.pricePerGuest,
    basePrice: item.basePrice,
    includedGuests: item.includedGuests,
    excessGuestPrice: item.excessGuestPrice,
    minGuests: item.minGuests,
    maxGuests: item.maxGuests,
  })), [
    { name: 'PHP 480 Per Head', eventType: 'Standard Catering', pricingType: 'PER_HEAD', pricePerGuest: 480, basePrice: null, includedGuests: null, excessGuestPrice: null, minGuests: null, maxGuests: null },
    { name: 'PHP 580 Per Head', eventType: 'Standard Catering', pricingType: 'PER_HEAD', pricePerGuest: 580, basePrice: null, includedGuests: null, excessGuestPrice: null, minGuests: null, maxGuests: null },
    { name: 'PHP 680 Per Head', eventType: 'Standard Catering', pricingType: 'PER_HEAD', pricePerGuest: 680, basePrice: null, includedGuests: null, excessGuestPrice: null, minGuests: null, maxGuests: null },
    { name: 'Bronze Package', eventType: 'Wedding', pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 32_500, includedGuests: 50, excessGuestPrice: 650, minGuests: null, maxGuests: null },
    { name: 'Silver Package', eventType: 'Wedding', pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 75_000, includedGuests: 100, excessGuestPrice: 750, minGuests: null, maxGuests: null },
    { name: 'Gold Package', eventType: 'Wedding', pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 102_000, includedGuests: 120, excessGuestPrice: 850, minGuests: null, maxGuests: null },
    { name: 'Amethyst Package', eventType: 'Debut', pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 85_888, includedGuests: 50, excessGuestPrice: 650, minGuests: null, maxGuests: null },
    { name: 'Diamond Package', eventType: 'Debut', pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 138_888, includedGuests: 100, excessGuestPrice: 750, minGuests: null, maxGuests: null },
    { name: 'Ruby Package', eventType: 'Debut', pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 198_888, includedGuests: 120, excessGuestPrice: 850, minGuests: null, maxGuests: null },
  ]);
  assert.ok(catalogSync.CLIENT_PACKAGE_DEFINITIONS.every((item) => item.inclusions.length > 0));
});

test('client catalog defines exactly the published add-ons and prices', () => {
  assert.deepEqual(catalogSync.CLIENT_ADD_ON_DEFINITIONS.map((item) => ({
    name: item.name,
    price: item.price,
  })), [
    { name: 'Tiffany Chair', price: 100 },
    { name: 'Same-Day Edit Video', price: 15_000 },
    { name: 'Airbrush Hair and Makeup Upgrade', price: 6_000 },
    { name: 'Stage Backdrop', price: 15_000 },
    { name: 'LED Wall', price: 20_000 },
    { name: 'Basic Sound and Lights', price: 7_000 },
    { name: 'Professional Host', price: 8_000 },
    { name: 'Host or Magician', price: 7_000 },
    { name: 'Basic Photobooth (2 Hours Unlimited)', price: 4_000 },
    { name: 'Magnetic Photobooth (2 Hours Unlimited)', price: 5_000 },
    { name: 'Mirror Photobooth (2 Hours Unlimited)', price: 10_000 },
    { name: 'Lechon (25-30 kg Live Weight)', price: 12_500 },
    { name: 'Lechon (35-40 kg Live Weight)', price: 14_000 },
    { name: 'Grazing Table for 50 Guests', price: 15_000 },
    { name: 'Grazing Table for 100 Guests', price: 22_000 },
    { name: 'Coffee Bar for 50 Guests', price: 15_000 },
    { name: 'Coffee Bar for 100 Guests', price: 22_000 },
  ]);
});

test('catalog sync defaults to dry-run and rejects unsupported arguments', () => {
  assert.deepEqual(catalogSync.parseCatalogSyncMode([]), { apply: false, deactivateProvisional: false });
  assert.deepEqual(catalogSync.parseCatalogSyncMode(['--dry-run']), { apply: false, deactivateProvisional: false });
  assert.deepEqual(catalogSync.parseCatalogSyncMode(['--apply']), { apply: true, deactivateProvisional: false });
  assert.deepEqual(catalogSync.parseCatalogSyncMode(['--apply', '--deactivate-provisional']), {
    apply: true,
    deactivateProvisional: true,
  });
  assert.throws(
    () => catalogSync.parseCatalogSyncMode(['--deactivate-provisional']),
    /requires --apply/,
  );
  assert.throws(() => catalogSync.parseCatalogSyncMode(['--force']), /Unsupported catalog sync argument/);
});

test('dry-run reports definitions without invoking the writer', async () => {
  let writes = 0;
  const result = await catalogSync.syncClientCatalog({
    apply: false,
    writer: {
      upsertPackage: async () => { writes += 1; },
      upsertAddOn: async () => { writes += 1; },
      deactivateProvisionalCatalog: async () => { writes += 1; },
    },
  });

  assert.equal(writes, 0);
  assert.deepEqual(result, {
    mode: 'dry-run',
    packageCount: 9,
    inclusionCount: 147,
    addOnCount: 17,
    deactivatedProvisional: false,
  });
});

test('apply is repeatable and preserves unrelated catalog entries', async () => {
  const packages = new Map<string, { inclusions: string[] }>([
    ['unrelated::Existing Package', { inclusions: ['Keep me'] }],
  ]);
  const addOns = new Map<string, number>([['Existing Add-on', 321]]);
  const writer = {
    async upsertPackage(item: typeof catalogSync.CLIENT_PACKAGE_DEFINITIONS[number]) {
      packages.set(`${item.eventType}::${item.name}`, { inclusions: [...item.inclusions] });
    },
    async upsertAddOn(item: typeof catalogSync.CLIENT_ADD_ON_DEFINITIONS[number]) {
      addOns.set(item.name, item.price);
    },
    async deactivateProvisionalCatalog() {
      throw new Error('Cleanup should not run without an explicit flag.');
    },
  };

  await catalogSync.syncClientCatalog({ apply: true, writer });
  await catalogSync.syncClientCatalog({ apply: true, writer });

  assert.equal(packages.size, 10);
  assert.equal(addOns.size, 18);
  assert.deepEqual(packages.get('unrelated::Existing Package'), { inclusions: ['Keep me'] });
  assert.equal(addOns.get('Existing Add-on'), 321);
  assert.equal(addOns.get('Tiffany Chair'), 100);
  assert.deepEqual(packages.get('Debut::Amethyst Package')?.inclusions.slice(0, 2), [
    'Steamed rice',
    'Choice of three main dishes',
  ]);
});

test('provisional catalog deactivation only runs when explicitly requested during apply', async () => {
  let cleanupCalls = 0;
  const writer = {
    async upsertPackage() {},
    async upsertAddOn() {},
    async deactivateProvisionalCatalog() { cleanupCalls += 1; },
  };

  const ordinaryApply = await catalogSync.syncClientCatalog({ apply: true, writer });
  assert.equal(cleanupCalls, 0);
  assert.equal(ordinaryApply.deactivatedProvisional, false);

  const cleanupApply = await catalogSync.syncClientCatalog({
    apply: true,
    deactivateProvisional: true,
    writer,
  });
  assert.equal(cleanupCalls, 1);
  assert.equal(cleanupApply.deactivatedProvisional, true);
});
