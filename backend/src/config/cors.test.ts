import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedFrontendOrigin } from './cors.js';

test('allows equivalent loopback frontend origins in development', () => {
  assert.equal(
    isAllowedFrontendOrigin('http://127.0.0.1:4200', 'http://localhost:4200', false),
    true,
  );
  assert.equal(
    isAllowedFrontendOrigin('http://localhost:4200', 'http://localhost:4200', false),
    true,
  );
});

test('keeps production CORS restricted to the configured origin', () => {
  assert.equal(
    isAllowedFrontendOrigin('http://127.0.0.1:4200', 'http://localhost:4200', true),
    false,
  );
  assert.equal(
    isAllowedFrontendOrigin('https://lachef.example', 'https://lachef.example', true),
    true,
  );
});

test('rejects development origins using another port or a non-loopback host', () => {
  assert.equal(
    isAllowedFrontendOrigin('http://127.0.0.1:4300', 'http://localhost:4200', false),
    false,
  );
  assert.equal(
    isAllowedFrontendOrigin('http://example.com:4200', 'http://localhost:4200', false),
    false,
  );
});
