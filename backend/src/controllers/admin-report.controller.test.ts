import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';

const [{ adminReportController }, { adminReportService }] = await Promise.all([
  import('./admin-report.controller.js'),
  import('../services/admin-report.service.js'),
]);

test('report handlers return JSON envelopes and dated CSV attachments', async t => {
  t.mock.method(adminReportService, 'reservationReport', async () => ({ summary: { reservationCount: 0, totalGuests: 0 }, items: [], upcomingItems: [] } as any));
  t.mock.method(adminReportService, 'reservationCsv', async () => '\uFEFFA,B\r\n');
  const headers: Record<string, string> = {};
  let body: unknown;
  const response = {
    json(value: unknown) { body = value; return this; },
    setHeader(name: string, value: string) { headers[name] = value; return this; },
    send(value: unknown) { body = value; return this; },
  } as unknown as Response;
  const next = (() => undefined) as NextFunction;
  const request = { query: {} } as Request;
  await adminReportController.reservations(request, response, next);
  assert.equal((body as any).success, true);
  await adminReportController.reservationExport(request, response, next);
  assert.equal(headers['Content-Type'], 'text/csv; charset=utf-8');
  assert.match(headers['Content-Disposition']!, /^attachment; filename="la-chef-reservations-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.equal(body, '\uFEFFA,B\r\n');
});

test('admin report routes are guarded and register export routes explicitly', () => {
  const source = readFileSync(new URL('../routes/admin.routes.ts', import.meta.url), 'utf8');
  assert.match(source, /Router\(\)\.use\(requireAdmin\)/);
  assert.match(source, /\.get\('\/reports\/reservations\/export',\s*adminReportController\.reservationExport\)/);
  assert.match(source, /\.get\('\/reports\/payments\/export',\s*adminReportController\.paymentExport\)/);
  assert.match(source, /\.get\('\/reports\/reservations',\s*adminReportController\.reservations\)/);
  assert.match(source, /\.get\('\/reports\/payments',\s*adminReportController\.payments\)/);
});
