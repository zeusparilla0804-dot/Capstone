import assert from 'node:assert/strict';
import test from 'node:test';
import { priceSelectedAddOns } from './add-on-quantity.service.js';

const catalog = [
  { id: 1, name: 'Tiffany Chair', description: '', price: 100 },
  { id: 2, name: 'Lechon (35-40 kg Live Weight)', description: '', price: 14000 },
  { id: 3, name: 'Coffee Bar', description: '', price: 4000 },
];

test('supports quantities for the 25-30 kg lechon at its unchanged catalog unit price', () => {
  const lechon = [{ id: 4, name: 'Lechon (25-30 kg Live Weight)', description: '', price: 12500 }];
  const [item] = priceSelectedAddOns(lechon, { '4': 2 });
  assert.equal(item!.quantity, 2);
  assert.equal(item!.unitPrice, 12500);
  assert.equal(item!.price, 25000);
  for (const quantity of [0, -1, 1.5]) assert.throws(() => priceSelectedAddOns(lechon, { '4': quantity }), /quantity/i);
});

test('recalculates quantity subtotals from catalog prices and defaults old selections to one', () => {
  const items = priceSelectedAddOns(catalog, { '1': 12, '2': 2 });
  assert.deepEqual(items.map(item => [item.unitPrice, item.quantity, item.price]), [[100, 12, 1200], [14000, 2, 28000], [4000, 1, 4000]]);
  assert.equal(items.reduce((sum, item) => sum + item.price, 0), 33200);
  assert.equal(priceSelectedAddOns(catalog)[0]!.price, 100);
  assert.equal(priceSelectedAddOns([{ ...catalog[1]!, name: 'Lechon (35–40 kg Live Weight)' }], { '2': 2 })[0]!.price, 28000);
});

test('rejects invalid quantities, unavailable selections, and quantities on other add-ons', () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity, '2', 2147483648]) {
    assert.throws(() => priceSelectedAddOns(catalog, { '1': quantity } as any), /quantity/i);
  }
  assert.throws(() => priceSelectedAddOns(catalog, { '3': 2 }), /quantity/i);
  assert.throws(() => priceSelectedAddOns(catalog, { '99': 2 }), /selected/i);
});

test('coffee bar capacity options multiply by the number of stations', () => {
  const [item] = priceSelectedAddOns([{ id: 5, name: 'Coffee Bar for 100 Guests', description: '', price: 22_000 }], { '5': 5 });
  assert.equal(item?.quantity, 5);
  assert.equal(item?.price, 110_000);
});
