import assert from 'node:assert/strict';
import test from 'node:test';
import { renderEmail, validateEmailPayload } from './email-templates.js';

const payload = { customerName: 'Customer', bookingReference: 'BK-42', eventDate: '2026-12-10', amount: '70000.00',
  amountPaid: '70000.00', requiredDeposit: '77000.00', remainingDeposit: '7000.00', remainingBalance: '84000.00',
  correctionReason: 'Bank statement confirms only 70000.' };

test('verification mail states the deposit shortfall separately from the complete balance', () => {
  const mail = renderEmail('PAYMENT_PROOF_VERIFIED', payload);
  assert.match(mail.text, /Down payment incomplete/);
  assert.match(mail.text, /Remaining down payment: PHP 7000\.00/);
  assert.match(mail.text, /Total balance due: PHP 84000\.00/);
  assert.match(mail.text, /Admin note: Bank statement/);
  assert.match(mail.text, /included in the total balance/);
  const escaped = renderEmail('PAYMENT_PROOF_VERIFIED', { ...payload, correctionReason: '<script>unsafe</script>' });
  assert.doesNotMatch(escaped.html, /<script>/);
  assert.match(escaped.html, /&lt;script&gt;/);
});

test('completed deposits and legacy verification notifications do not claim a deposit is incomplete', () => {
  assert.doesNotMatch(renderEmail('PAYMENT_PROOF_VERIFIED', { ...payload, amount: '7000.00', amountPaid: '77000.00', remainingDeposit: '0.00', remainingBalance: '77000.00' }).text, /Down payment incomplete/);
  assert.doesNotThrow(() => validateEmailPayload('PAYMENT_PROOF_VERIFIED', { customerName: 'Customer', bookingReference: 'BK-42', eventDate: '2026-12-10', amount: '70000.00' }));
});
