import assert from 'node:assert/strict';
import test from 'node:test';
import type sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost'; process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test'; process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';

test('audit dates filter a Philippine day while returning normalized UTC instants', async () => {
  const { createAdminOperationsRepository } = await import('./admin.repository.js');
  let command = '';
  const params: Record<string, unknown> = {};
  const request = {
    replaceInput(name: string, _type: unknown, value: unknown) { params[name] = value; return this; },
    async query(sql: string) { command = sql; return { recordset: [] }; },
  } as unknown as sql.Request;
  const repository = createAdminOperationsRepository({ readRequest: async () => request, transaction: async work => work(request) });
  await repository.auditLog({ page: 1, pageSize: 20, action: '', entityType: '', dateFrom: '2026-11-14', dateTo: '2026-11-14' });
  assert.equal(params.dateFrom, '2026-11-14'); assert.equal(params.dateTo, '2026-11-14');
  assert.match(command, /DATEPART\(TZOFFSET,SYSDATETIMEOFFSET\(\)\)/);
  assert.match(command, /DATEADD\(minute,-@serverOffset,a.created_at\) createdAt/);
  assert.match(command, /DATEADD\(minute,@serverOffset,DATEADD\(hour,-8,CONVERT\(datetime2,NULLIF\(@dateFrom,''\)\)\)\)/);
  assert.match(command, /DATEADD\(day,1,@dateToLocal\)/);
  assert.match(command, /a.created_at>=@dateFromLocal/);
  assert.match(command, /a.created_at<@dateToExclusive/);
});
