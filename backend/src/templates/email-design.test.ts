import assert from 'node:assert/strict';
import test from 'node:test';
import { renderEmail, renderEmailVerificationCode, renderPasswordResetRequestedEmail } from './email-templates.js';

test('verification email has a branded responsive layout, selectable code and truthful expiry', () => {
  const message = renderEmailVerificationCode('Juan & <Customer>', '012345');
  assert.match(message.html, /max-width:600px/);
  assert.match(message.html, /role="presentation"/);
  assert.match(message.html, /Juan &amp; &lt;Customer&gt;/);
  assert.match(message.html, /012345/);
  assert.match(message.text, /012345/);
  assert.match(message.text, /10 minutes/);
  assert.doesNotMatch(message.html, /<script|<img|fonts.googleapis|<form|tracking/i);
  assert.doesNotMatch(message.subject, /012345|confirmed|verified/i);
});
test('ordinary email previews cannot expose account verification or reset secrets', () => {
  for (const key of ['EMAIL_VERIFICATION_CODE', 'PASSWORD_RESET_REQUESTED'] as const) {
    assert.throws(() => renderEmail(key, { accountName: 'Juan', selector: 'a'.repeat(22), accountType: 'CUSTOMER' }), /unavailable/);
  }
});
test('welcome and reset emails share the branded layout without changing security facts', () => {
  const welcome = renderEmail('ACCOUNT_REGISTERED', { displayName: 'Juan' });
  assert.match(welcome.html, /max-width:600px/);
  const reset = renderPasswordResetRequestedEmail('Juan', 'https://lachef.example/reset-password?token=abc');
  assert.match(reset.html, /max-width:600px/);
  assert.match(reset.text, /15 minutes/);
  assert.match(reset.html, /href="https:\/\/lachef.example\/reset-password\?token=abc"/);
});
