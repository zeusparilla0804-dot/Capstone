import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import app from './app.js';

let server: Server;
let origin: string;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('session checks do not consume the authentication-attempt rate limit', async () => {
  const statuses: number[] = [];

  for (let request = 0; request < 21; request += 1) {
    const response = await fetch(`${origin}/api/auth/me`);
    statuses.push(response.status);
  }

  assert.deepEqual(statuses, Array.from({ length: 21 }, () => 401));
});
