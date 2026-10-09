import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from './app-error.js';
import { emailAddress, finiteMoney, identifier, isoDate, text, time24 } from './validation.js';

test('identifier accepts only positive safe integers', () => {
  assert.equal(identifier('42'), 42);
  for (const value of [0, -1, 1.5, 'abc', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => identifier(value), AppError);
});

test('date and time validation rejects impossible values', () => {
  assert.equal(isoDate('2030-12-31', 'Event date'), '2030-12-31');
  assert.equal(time24('23:59'), '23:59');
  assert.throws(() => isoDate('2030-02-31', 'Event date'), AppError);
  assert.throws(() => time24('24:00'), AppError);
});

test('future-only dates reject today', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.throws(() => isoDate(today, 'Event date', true), AppError);
});

test('money validation rounds to SQL precision and rejects unsafe amounts', () => {
  assert.equal(finiteMoney(12.345, 'Amount'), 12.35);
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, 100_000_000]) assert.throws(() => finiteMoney(value, 'Amount'), AppError);
});

test('text and email enforce normalized length and shape', () => {
  assert.equal(text('  LA Chef  ', 'Name', { max: 20 }), 'LA Chef');
  assert.equal(emailAddress(' CHEF@example.com '), 'chef@example.com');
  assert.throws(() => text('123456', 'Name', { max: 5 }), AppError);
  assert.throws(() => emailAddress('not-an-email'), AppError);
});
