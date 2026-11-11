import assert from 'node:assert/strict';
import test from 'node:test';
import { addOnAvailableForEvent, addOnEventTypes } from './add-on-event-policy.js';

test('event add-ons exclude magician from wedding and makeup from corporate', () => {
  assert.equal(addOnAvailableForEvent('Host or Magician', 'wedding'), false);
  assert.equal(addOnAvailableForEvent('Host or Magician', 'birthday'), true);
  assert.equal(addOnAvailableForEvent('Airbrush Hair and Makeup Upgrade', 'corporate'), false);
  assert.equal(addOnAvailableForEvent('Airbrush Hair and Makeup Upgrade', 'debut'), true);
  assert.equal(addOnAvailableForEvent('Coffee Bar for 100 Guests', 'wedding'), true);
  assert.deepEqual(addOnEventTypes('Host or Magician'), ['birthday', 'debut']);
});
