import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from './app-error.js';
import { emailAddress, finiteMoney, identifier, isoDate, philippineMobileNumber, registrationEmailAddress, text, time24 } from './validation.js';

test('Philippine mobile numbers accept only local or +63 mobile formats and normalize display spaces', () => {
  for (const [input, expected] of [
    ['09171234567', '09171234567'], ['+639171234567', '+639171234567'],
    ['0917 123 4567', '09171234567'], [' +63917 123 4567 ', '+639171234567'],
  ]) assert.equal(philippineMobileNumber(input), expected);
  for (const input of ['', null, 9171234567, '09999999999999999999999', '0917123456', '091712345678', '08171234567', '+6391712345678', '0917abc4567', '02 8123 4567', '+14155552671', '09 171234567']) {
    assert.throws(() => philippineMobileNumber(input), (error: unknown) => error instanceof AppError && error.statusCode === 400);
  }
});

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

test('registration email rejects one-character local names', () => {
  assert.throws(() => registrationEmailAddress('q@gmail.com'), AppError);
  assert.equal(registrationEmailAddress('klint@gmail.com'), 'klint@gmail.com');
});

test('mobile validation rejects repeated and sequential dummy digits', () => {
  for (const phone of ['09111111111', '09123456789', '09999999999', '+639123456789']) {
    assert.throws(() => philippineMobileNumber(phone), AppError, phone);
  }
  assert.equal(philippineMobileNumber('09171234567'), '09171234567');
});
