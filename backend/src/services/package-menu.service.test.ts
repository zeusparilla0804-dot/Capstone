import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMenuSnapshot, packageMenu, parseMenuSelections, readMenuSnapshot } from './package-menu.service.js';

test('menu requests follow each published package inclusion and its number of main dishes', () => {
  const classic = packageMenu('PHP 480 Per Head')!;
  assert.deepEqual(classic.fields.slice(0, 3).map(field => field.label), ['Pork dish', 'Chicken dish', 'Fish dish']);
  assert.equal(classic.fields.some(field => field.key === 'soup'), false);
  assert.deepEqual(classic.fields.find(field => field.key === 'sideKind')?.options, ['Pasta', 'Noodles', 'Vegetables']);
  assert.ok(packageMenu('PHP 580 Per Head')?.fields.some(field => field.key === 'appetizer'));
  assert.ok(packageMenu('PHP 480 Per Head')?.includedItems.includes('Dinner rolls with butter'));
  assert.ok(packageMenu('PHP 580 Per Head')?.includedItems.includes('Fresh garden salad with dressing'));
  assert.deepEqual(packageMenu('Amethyst Package')?.includedItems, ['Steamed rice']);
  const full = packageMenu('PHP 680 Per Head')!;
  assert.ok(full.fields.some(field => field.key === 'soup'));
  assert.ok(full.fields.some(field => field.key === 'vegetable'));
  assert.deepEqual(full.fields.find(field => field.key === 'sideKind')?.options, ['Pasta', 'Noodles']);
  for (const [name, count] of [['Amethyst Package', 3], ['Diamond Package', 4], ['Ruby Package', 4]] as const) {
    assert.equal(packageMenu(name)?.fields.filter(field => /^main\d$/.test(field.key)).length, count);
  }
  assert.deepEqual(packageMenu('Bronze Package')?.fields[0].options, ['Beef', 'Pork']);
  assert.ok(packageMenu('Silver Package')?.fields.some(field => field.key === 'soup'));
  assert.ok(packageMenu('Gold Package')?.fields.some(field => field.key === 'vegetable'));
  assert.equal(packageMenu('Legacy custom quote'), undefined);
});

test('menu selections are validated against the chosen package and stored with original labels', () => {
  const definition = packageMenu('PHP 480 Per Head')!;
  const choices = Object.fromEntries(definition.fields.map(field => [field.key, field.options?.[0] ?? `Preferred ${field.label}`]));
  const snapshot = buildMenuSnapshot('PHP 480 Per Head', choices)!;
  assert.deepEqual(snapshot.includedItems, ['Dinner rolls with butter', 'Seasonal fresh fruit platter', 'Steamed rice', 'Purified water with tube ice']);
  assert.equal(snapshot.items[0].label, 'Pork dish');
  assert.equal(snapshot.items[0].value, 'Preferred Pork dish');
  assert.deepEqual(readMenuSnapshot(JSON.stringify(snapshot)), snapshot);
  assert.throws(() => buildMenuSnapshot('PHP 480 Per Head', { ...choices, sideKind: 'Soup' }), /menu option/i);
  assert.throws(() => buildMenuSnapshot('PHP 480 Per Head', { ...choices, beef: 'Beef dish' }), /package/i);
  assert.throws(() => buildMenuSnapshot('PHP 680 Per Head', choices), /menu/i);
  assert.throws(() => buildMenuSnapshot('Unknown package', choices), /menu/i);
  assert.equal(buildMenuSnapshot('PHP 480 Per Head', undefined), undefined);
});

test('publishes catalog dishes for the fields and categories offered by each package', () => {
  const classic = packageMenu('PHP 480 Per Head')!;
  assert.deepEqual(classic.fields.find(field => field.key === 'chicken')?.dishChoices, [
    'Chicken Teriyaki', 'Chicken Stroganoff', 'Hawaiian Chicken', 'Buttered Chicken',
    'Chicken Pastel', 'Chicken Inasal', 'Buffalo Wings', 'Oriental Chicken', 'Garlic Roasted Chicken',
  ]);
  const side = classic.fields.find(field => field.key === 'sideDish')?.dishChoices;
  assert.ok(side && 'categoryField' in side);
  assert.equal(side.categoryField, 'sideKind');
  assert.ok(side.byCategory['Pasta'].includes('Bolognese'));
  assert.ok(side.byCategory['Noodles'].includes('Pansit Malabon'));
  assert.ok(side.byCategory['Vegetables'].includes('Chopsuey'));
  assert.equal(classic.fields.find(field => field.key === 'drink')?.dishChoices, undefined);

  const bronze = packageMenu('Bronze Package')!;
  const firstMain = bronze.fields.find(field => field.key === 'firstMainDish')?.dishChoices;
  assert.ok(firstMain && 'categoryField' in firstMain);
  assert.equal(firstMain.categoryField, 'firstMainProtein');
  assert.ok(firstMain.byCategory['Beef'].includes('Beef Salpicao'));
  assert.ok(firstMain.byCategory['Pork'].includes('Grilled Liempo'));

  const ruby = packageMenu('Ruby Package')!;
  const main = ruby.fields.find(field => field.key === 'main1')?.dishChoices;
  assert.ok(main && !('categoryField' in main));
  assert.ok(main.includes('Fish & Tofu with Oyster Sauce'));
  assert.deepEqual(ruby.fields.find(field => field.key === 'soup')?.dishChoices, [
    'Crab & Corn Soup', 'Mushroom Soup', 'Pumpkin Soup',
  ]);
});

test('menu input rejects malformed selections and legacy snapshots remain readable', () => {
  assert.equal(parseMenuSelections(undefined), undefined);
  for (const value of [null, [], 'menu', { pork: 4 }, { pork: 'a'.repeat(121) }]) {
    assert.throws(() => parseMenuSelections(value), /menu|dish/i);
  }
  assert.deepEqual(parseMenuSelections({ pork: '  Pork dish  ' }), { pork: 'Pork dish' });
  assert.equal(readMenuSnapshot(null), undefined);
  assert.equal(readMenuSnapshot('{broken'), undefined);
  assert.equal(readMenuSnapshot('{}'), undefined);
});
