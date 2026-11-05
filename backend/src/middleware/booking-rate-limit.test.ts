import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { bookingCreationLimit } from './booking-rate-limit.js';

test('booking creation is throttled by authenticated customer without blocking other customers or reads', async () => {
  const app = express();
  app.use((req, _res, next) => { req.customer = { id: Number(req.get('x-test-customer') ?? 1) } as any; next(); });
  app.post('/bookings', bookingCreationLimit, (_req, res) => res.sendStatus(201));
  app.get('/bookings', (_req, res) => res.sendStatus(200));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/bookings`;
  try {
    for (let i = 0; i < 20; i++) assert.equal((await fetch(url, { method: 'POST' })).status, 201);
    assert.equal((await fetch(url, { method: 'POST' })).status, 429);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'x-test-customer': '2' } })).status, 201);
    assert.equal((await fetch(url)).status, 200);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
